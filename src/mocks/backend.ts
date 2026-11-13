import type { FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { Approval, AuditEvent, Capability, Claim, ClaimKind, MoneyReceipt, QueueItem, SearchResult, Service, Settings, TimelineEntry } from '../store/types';
import * as db from './data';

/**
 * A stand-in for the backend's /admin API, answering in the browser with sample data.
 * It applies the same rules the real backend must: capabilities per service, a fresh
 * authenticator code on money and staff changes, and an activity-log entry for every change.
 * Any 6-digit code works except 000000, which shows the wrong-code message.
 */

export const PREVIEW_KEY = 'dezen-admin-preview';
export const PREVIEW_ROLES: Record<string, { label: string; capabilities: Capability[]; services: (Service | '*')[] }> = {
  owner: { label: 'Owner (everything)', capabilities: ['support', 'verify', 'read_pii', 'move_money', 'staff_admin'], services: ['*'] },
  finance: { label: 'Finance (all services)', capabilities: ['support', 'read_pii', 'move_money'], services: ['*'] },
  verifier: { label: 'Foods operations (DezenFoods only)', capabilities: ['support', 'verify'], services: ['food'] },
  support: { label: 'Support (Foods and Express, read only)', capabilities: ['support'], services: ['food', 'express'] },
};
const role = () => {
  try {
    return PREVIEW_ROLES[sessionStorage.getItem(PREVIEW_KEY) ?? 'owner'] ?? PREVIEW_ROLES.owner;
  } catch {
    return PREVIEW_ROLES.owner;
  }
};
const EMAIL = 'you@dezenmart.com';

type Result = { data: unknown; error?: undefined } | { data?: undefined; error: FetchBaseQueryError };
type Req = { method: string; params: Record<string, string>; body: Record<string, unknown>; code?: string; match: RegExpMatchArray; gated?: boolean };
type Handler = (req: Req) => unknown;
interface Route {
  method: string;
  path: RegExp;
  /** The capability and service the backend must check. */
  needs?: [Capability, Service];
  /** Needs a fresh authenticator code. */
  code?: boolean;
  /** Plain-words summary for the activity log (changes only). */
  log?: (req: Req) => string;
  handle: Handler;
}

class Fail extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const notFound = (what: string) => new Fail(404, `${what} not found`);

const ok = (data: unknown) => ({ status: 'success', data });
const page = <T,>(items: T[], params: Record<string, string>, limit = 20) => {
  const p = Math.max(1, Number(params.page) || 1);
  return { items: items.slice((p - 1) * limit, p * limit), total: items.length, page: p, limit };
};
const matches = (q: string | undefined, ...fields: (string | undefined)[]) =>
  !q || fields.some((f) => f?.toLowerCase().includes(q.toLowerCase()));
const byStatus = <T extends { status: string }>(xs: T[], s?: string) => (s ? xs.filter((x) => x.status === s) : xs);
const now = () => new Date().toISOString();
const find = <T extends { id: string }>(xs: T[], id: string, what: string) => {
  const x = xs.find((v) => v.id === id);
  if (!x) throw notFound(what);
  return x;
};
const staffNote = (text: string): TimelineEntry => ({ at: now(), kind: 'staff', text, actor: EMAIL });
const notes: Record<string, TimelineEntry[]> = {};
const addNote = (id: string, text: string) => (notes[id] ??= []).push(staffNote(text));
const needReason = (req: Req) => {
  const reason = String(req.body.reason ?? req.body.note ?? '').trim();
  if (reason.length < 3) throw new Fail(422, 'Give a reason');
  return reason;
};

let refNo = 88200;
/** What every money action returns. The admin shows this receipt; it never guesses. */
const receipt = (
  amount: number,
  recipient: string,
  state: MoneyReceipt['state'],
  next?: MoneyReceipt['next'],
  currency = 'NGN',
): MoneyReceipt => ({ reference: `DZ-${++refNo}`, amount, currency, recipient, state, at: now(), by: EMAIL, next });
/** The typed amount must match what will move. */
const checkAmount = (req: Req, expected: number) => {
  if (Number(req.body.amount) !== expected) throw new Fail(422, `The amount must be exactly ${expected.toLocaleString('en-NG')}`);
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// ── claims ───────────────────────────────────────────────────────────────────

const NAME = 'You';
/** Refuse a money action on a record someone else is handling. */
const guardClaim = (rec: { claim?: Claim | null }) => {
  if (rec.claim && rec.claim.by !== EMAIL) {
    const since = new Date(rec.claim.since).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
    throw new Fail(409, `${rec.claim.name} is working on this since ${since}. Ask them, or take it over first.`);
  }
};
const claimable = (kind: ClaimKind, id: string): { rec: { claim?: Claim | null }; label: string; service: Service } => {
  if (kind === 'food-order') { const o = find(db.foodOrders, id, 'Order'); return { rec: o, label: o.orderRef, service: 'food' }; }
  if (kind === 'booking') { const b = find(db.bookings, id, 'Trip'); return { rec: b, label: b.bookingRef, service: 'express' }; }
  if (kind === 'withdrawal') { const w = find(db.withdrawals, id, 'Withdrawal'); return { rec: w, label: `${w.rider.name}'s withdrawal`, service: 'express' }; }
  const d = find(db.shopDisputes, id, 'Dispute');
  return { rec: d, label: d.order.orderRef, service: 'shopping' };
};

// ── second approver ──────────────────────────────────────────────────────────

/** What approving each waiting request will do. */
const performers = new Map<string, () => MoneyReceipt>();
let approvalNo = 100;
/**
 * Above the threshold, a money action becomes a request for a second person instead of moving money.
 */
const gate = (
  req: Req,
  info: { service: Service; summary: string; amount: number; currency?: string; recipient: string; link: string; target: Approval['target'] },
  perform: () => MoneyReceipt,
) => {
  if (info.amount <= db.settings.approvalThreshold) return ok(perform());
  req.gated = true;
  const id = `ap${++approvalNo}`;
  db.approvals.unshift({ id, ...info, currency: info.currency ?? 'NGN', reason: String(req.body.reason ?? req.body.note ?? ''), requestedBy: EMAIL, requestedAt: now(), status: 'pending' });
  performers.set(id, perform);
  return ok({ ...receipt(info.amount, info.recipient, 'awaiting_approval', { label: 'See approvals', link: '/approvals' }, info.currency ?? 'NGN'), approvalId: id });
};

// ── queues and search ────────────────────────────────────────────────────────

const queues = (): QueueItem[] => {
  const oldest = (dates: string[]) => dates.sort()[0];
  const failedFood = db.foodOrders.filter((o) => o.payout?.status === 'failed' || o.refund?.status === 'failed');
  const toRefund = db.bookings.filter((b) => b.status === 'cancelled' && b.paymentStatus === 'paid');
  // A withdrawal already waiting for a second approval is counted there, not here.
  const awaiting = (w: (typeof db.withdrawals)[number]) => db.approvals.some((ap) => ap.status === 'pending' && ap.target.id === w.id);
  const stuck = db.withdrawals.filter((w) => (w.status === 'failed' || w.status === 'manual') && !awaiting(w));
  const foodDisputes = db.foodOrders.filter((o) => o.dispute && !o.dispute.resolved);
  const shopDisputes = db.shopDisputes.filter((d) => !d.ruling);
  const failedPayouts = failedFood.filter((o) => o.payout?.status === 'failed').length;
  const failedRefunds = failedFood.filter((o) => o.refund?.status === 'failed').length;
  const handPay = stuck.filter((w) => w.status === 'manual').length;
  const pendingVendors = byStatus(db.vendors, 'pending');
  const pendingRiders = byStatus(db.riders, 'pending');
  const reported = db.products.filter((p) => p.reports > 0 && p.visible);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const r0 = role();
  const waitingApproval = db.approvals.filter((a) => a.status === 'pending' && r0.capabilities.includes('move_money') && (r0.services.includes('*') || r0.services.includes(a.service)));
  const items: QueueItem[] = [
    { key: 'approvals', service: 'platform', label: 'Waiting for a second approval', detail: 'Large payments a colleague asked for', count: waitingApproval.length, amountAtStake: sum(waitingApproval.map((a) => a.amount)), oldestAt: oldest(waitingApproval.map((a) => a.requestedAt)), link: '/approvals', urgent: true },
    { key: 'express-refunds', service: 'express', label: 'Cancelled trips to refund', detail: `${plural(toRefund.length, 'customer', 'customers')} paid and waiting`, count: toRefund.length, amountAtStake: sum(toRefund.map((b) => b.fare)), oldestAt: oldest(toRefund.map((b) => b.createdAt)), link: '/express/bookings?status=to_refund', urgent: true },
    { key: 'withdrawals', service: 'express', label: 'Rider withdrawals stuck', detail: `${plural(stuck.length - handPay, 'bank failure', 'bank failures')} · ${handPay} to pay by hand`, count: stuck.length, amountAtStake: sum(stuck.map((w) => w.amount)), oldestAt: oldest(stuck.map((w) => w.requestedAt)), link: '/express/withdrawals?status=stuck', urgent: true },
    { key: 'food-money', service: 'food', label: 'Food payments that failed', detail: `${plural(failedPayouts, 'vendor payout', 'vendor payouts')} · ${plural(failedRefunds, 'buyer refund', 'buyer refunds')}`, count: failedFood.length, amountAtStake: sum(failedFood.map((o) => (o.refund?.status === 'failed' ? o.refund.amount : (o.payout?.amount ?? 0)))), oldestAt: oldest(failedFood.map((o) => o.createdAt)), link: '/food/orders?status=money_failed', urgent: true },
    { key: 'food-disputes', service: 'food', label: 'Food disputes', detail: 'Buyers waiting for a ruling', count: foodDisputes.length, amountAtStake: sum(foodDisputes.map((o) => o.total)), oldestAt: oldest(foodDisputes.map((o) => o.dispute!.openedAt)), link: '/food/disputes' },
    { key: 'shop-disputes', service: 'shopping', label: 'Shopping disputes', detail: 'A buyer or seller is waiting for a ruling', count: shopDisputes.length, amountAtStake: null, oldestAt: oldest(shopDisputes.map((d) => d.openedAt)), link: '/shopping/disputes' },
    { key: 'vendors', service: 'food', label: 'Vendors to review', detail: 'New kitchens ready to sell', count: pendingVendors.length, amountAtStake: null, oldestAt: oldest(pendingVendors.map((v) => v.createdAt)), link: '/food/vendors?status=pending' },
    { key: 'riders', service: 'express', label: 'Riders to review', detail: 'Check licence and plate before they drive', count: pendingRiders.length, amountAtStake: null, oldestAt: oldest(pendingRiders.map((r) => r.createdAt)), link: '/express/riders?status=pending' },
    { key: 'providers', service: 'express', label: 'Delivery companies to review', detail: 'Companies asking to deliver orders', count: byStatus(db.providers, 'pending').length, amountAtStake: null, link: '/express/providers?status=pending' },
    { key: 'products', service: 'shopping', label: 'Reported products', detail: 'Buyers flagged these listings', count: reported.length, amountAtStake: null, link: '/shopping/products?status=reported' },
  ];
  const r = role();
  return items.filter((q) => r.services.includes('*') || r.services.includes(q.service));
};

const search = (q: string): SearchResult[] => {
  if (q.trim().length < 2) return [];
  const out: SearchResult[] = [];
  for (const p of db.people) if (matches(q, p.name, p.email, p.phone, p.accountNumber)) out.push({ kind: 'person', service: 'platform', id: p.id, title: p.name, subtitle: `${p.emailMasked} · joined ${new Date(p.joinedAt).getFullYear()}`, link: `/people/${p.id}` });
  for (const o of db.foodOrders) if (matches(q, o.orderRef, o.buyer.name, o.vendor.name)) out.push({ kind: 'order', service: 'food', id: o.id, title: o.orderRef, subtitle: `${o.vendor.name} · ${o.buyer.name}`, link: `/food/orders/${o.id}` });
  for (const b of db.bookings) if (matches(q, b.bookingRef, b.customer.name, b.rider?.name)) out.push({ kind: 'booking', service: 'express', id: b.id, title: b.bookingRef, subtitle: `${b.pickup} → ${b.dropoff}`, link: `/express/bookings/${b.id}` });
  for (const o of db.shopOrders) if (matches(q, o.orderRef, o.buyer.name, o.seller.name, o.product.name)) out.push({ kind: 'order', service: 'shopping', id: o.id, title: o.orderRef, subtitle: `${o.product.name} · ${o.buyer.name}`, link: `/shopping/orders/${o.id}` });
  for (const p of db.payments) if (matches(q, p.reference)) out.push({ kind: 'payment', service: p.service, id: p.id, title: p.reference, subtitle: p.purpose, link: `/money/payments?q=${p.reference}` });
  for (const v of db.vendors) if (matches(q, v.businessName)) out.push({ kind: 'vendor', service: 'food', id: v.id, title: v.businessName, subtitle: `${v.lga}, ${v.state}`, link: `/food/vendors?q=${encodeURIComponent(v.businessName)}` });
  for (const r of db.riders) if (matches(q, r.name, r.plateNumber)) out.push({ kind: 'rider', service: 'express', id: r.id, title: r.name, subtitle: `${r.vehicleType} · ${r.plateNumber}`, link: `/express/riders?q=${encodeURIComponent(r.name)}` });
  const r = role();
  // Only what the person may open: People and payments need platform access.
  const mayOpen = (x: SearchResult) =>
    (r.services.includes('*') || r.services.includes(x.kind === 'person' || x.kind === 'payment' ? 'platform' : x.service)) &&
    r.capabilities.includes('support');
  return out.filter(mayOpen).slice(0, 30);
};

// The seeded approval: approving it sends the 180,000 withdrawal again.
performers.set('ap1', () => {
  const w = db.withdrawals.find((x) => x.id === 'w0101')!;
  w.status = 'processing';
  w.attempts += 1;
  return receipt(w.amount, `${w.rider.name} · ${w.bank} ${w.accountNumberMasked}`, 'sent');
});

// ── routes ───────────────────────────────────────────────────────────────────

const routes: Route[] = [
  // sign-in
  { method: 'POST', path: /^\/admin\/auth\/authenticator\/setup$/, handle: () => ok({ secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/Dezen%20Admin:you?secret=JBSWY3DPEHPK3PXP&issuer=Dezen%20Admin' }) },
  { method: 'POST', path: /^\/admin\/auth\/authenticator\/confirm$/, handle: () => ok({ authenticatorSet: true }) },
  {
    method: 'POST',
    path: /^\/admin\/auth\/session$/,
    handle: (req) => {
      if (req.body.code === '000000') throw new Fail(401, 'That code is not right; try the current one');
      return ok({ token: 'sample-staff-token', email: EMAIL, ...role() });
    },
  },
  { method: 'GET', path: /^\/admin\/auth\/me$/, handle: () => ok({ email: EMAIL, ...role() }) },
  { method: 'POST', path: /^\/admin\/auth\/sign-out$/, handle: () => ok({ signedOut: true }) },

  // claims
  {
    method: 'POST',
    path: /^\/admin\/claims$/,
    log: (r) => `${r.body.takeOver ? 'Took over' : 'Took'} ${claimable(r.body.kind as ClaimKind, String(r.body.id)).label}`,
    handle: (req) => {
      const { rec, service } = claimable(req.body.kind as ClaimKind, String(req.body.id));
      const r = role();
      if (!r.capabilities.includes('support') || !(r.services.includes('*') || r.services.includes(service))) throw new Fail(403, 'Your staff access does not cover this');
      if (rec.claim && rec.claim.by !== EMAIL && !req.body.takeOver) throw new Fail(409, `${rec.claim.name} is already working on this`);
      rec.claim = { by: EMAIL, name: NAME, since: now() };
      return ok(rec.claim);
    },
  },
  {
    method: 'DELETE',
    path: /^\/admin\/claims\/([^/]+)\/([^/]+)$/,
    log: (r) => `Let go of ${claimable(r.match[1] as ClaimKind, r.match[2]).label}`,
    handle: ({ match }) => {
      const { rec } = claimable(match[1] as ClaimKind, match[2]);
      if (rec.claim && rec.claim.by !== EMAIL) throw new Fail(409, 'Only the person handling this can let it go');
      rec.claim = null;
      return ok({ released: true });
    },
  },

  // approvals
  {
    method: 'GET',
    path: /^\/admin\/approvals$/,
    handle: ({ params }) => {
      const r = role();
      const mine = db.approvals.filter((a) => r.capabilities.includes('move_money') && (r.services.includes('*') || r.services.includes(a.service)));
      return ok(page(params.status ? mine.filter((a) => a.status === params.status) : mine, params));
    },
  },
  {
    method: 'POST',
    path: /^\/admin\/approvals\/([^/]+)\/approve$/,
    code: true,
    log: (r) => `Approved: ${db.approvals.find((a) => a.id === r.match[1])?.summary}`,
    handle: (req) => {
      const a = find(db.approvals, req.match[1], 'Approval');
      const r = role();
      if (!r.capabilities.includes('move_money') || !(r.services.includes('*') || r.services.includes(a.service))) throw new Fail(403, 'Your staff access does not cover this');
      if (a.status !== 'pending') throw new Fail(409, `This was already ${a.status}`);
      if (a.requestedBy === EMAIL) throw new Fail(409, 'You asked for this one, so someone else must approve it');
      checkAmount(req, a.amount);
      const perform = performers.get(a.id);
      if (!perform) throw new Fail(409, 'This request can no longer be carried out');
      const result = perform();
      a.status = 'approved';
      a.decidedBy = EMAIL;
      a.decidedAt = now();
      return ok(result);
    },
  },
  {
    method: 'POST',
    path: /^\/admin\/approvals\/([^/]+)\/decline$/,
    log: (r) => `Declined: ${db.approvals.find((a) => a.id === r.match[1])?.summary}`,
    handle: (req) => {
      const a = find(db.approvals, req.match[1], 'Approval');
      const r = role();
      if (!r.capabilities.includes('move_money') || !(r.services.includes('*') || r.services.includes(a.service))) throw new Fail(403, 'Your staff access does not cover this');
      if (a.status !== 'pending') throw new Fail(409, `This was already ${a.status}`);
      a.status = 'declined';
      a.declineReason = needReason(req);
      a.decidedBy = EMAIL;
      a.decidedAt = now();
      performers.delete(a.id);
      return ok(a);
    },
  },

  // home
  { method: 'GET', path: /^\/admin\/queues$/, handle: () => ok(queues()) },
  { method: 'GET', path: /^\/admin\/search$/, handle: (req) => ok(search(req.params.q ?? '')) },

  // DezenFoods
  {
    method: 'GET',
    path: /^\/admin\/food\/vendors$/,
    needs: ['support', 'food'],
    handle: ({ params }) => ok(page(byStatus(db.vendors, params.status).filter((v) => matches(params.q, v.businessName, v.ownerName)), params)),
  },
  {
    method: 'POST',
    path: /^\/admin\/food\/vendors\/([^/]+)\/review$/,
    needs: ['verify', 'food'],
    log: (r) => `${String(r.body.status) === 'approved' ? 'Approved' : String(r.body.status) === 'rejected' ? 'Rejected' : 'Suspended'} vendor ${db.vendors.find((v) => v.id === r.match[1])?.businessName}`,
    handle: (req) => {
      const v = find(db.vendors, req.match[1], 'Vendor');
      const status = req.body.status as typeof v.status;
      if (status !== 'approved') v.rejectionReason = needReason(req);
      v.status = status;
      return ok(v);
    },
  },
  {
    method: 'GET',
    path: /^\/admin\/food\/orders$/,
    needs: ['support', 'food'],
    handle: ({ params }) => {
      let xs = db.foodOrders;
      if (params.status === 'money_failed') xs = xs.filter((o) => o.payout?.status === 'failed' || o.refund?.status === 'failed');
      else xs = byStatus(xs, params.status);
      return ok(page(xs.filter((o) => matches(params.q, o.orderRef, o.vendor.name, o.buyer.name)), params));
    },
  },
  {
    method: 'GET',
    path: /^\/admin\/food\/orders\/([^/]+)$/,
    needs: ['support', 'food'],
    handle: ({ match }) => {
      const o = find(db.foodOrders, match[1], 'Order');
      const steps: [string, TimelineEntry['kind'], string?][] = [
        [`${o.buyer.name} placed the order`, 'status'],
        [`${o.buyer.name} paid ₦${o.total.toLocaleString('en-NG')}`, 'payment'],
        [`${o.vendor.name} accepted`, 'status'],
      ];
      if (o.dispute) steps.push([`${o.buyer.name} opened a dispute: “${o.dispute.reason}”`, 'message']);
      if (o.payout) steps.push([o.payout.status === 'failed' ? `Vendor payout failed ${o.payout.attempts} times: ${o.payout.lastError}` : o.payout.status === 'paid' ? 'Vendor paid' : 'Vendor payout on its way', 'payment']);
      if (o.refund) steps.push([o.refund.status === 'failed' ? `Refund failed ${o.refund.attempts} times: ${o.refund.lastError}` : o.refund.status === 'paid' ? 'Buyer refunded' : 'Refund on its way', 'payment']);
      return ok({ ...o, timeline: [...db.timelineFor(o.createdAt, steps), ...(notes[o.id] ?? [])] });
    },
  },
  {
    method: 'POST',
    path: /^\/admin\/food\/orders\/([^/]+)\/retry-money$/,
    needs: ['move_money', 'food'],
    code: true,
    log: (r) => `Retried the payment on ${db.foodOrders.find((o) => o.id === r.match[1])?.orderRef}`,
    handle: (req) => {
      const o = find(db.foodOrders, req.match[1], 'Order');
      const m = o.refund?.status === 'failed' ? o.refund : o.payout?.status === 'failed' ? o.payout : undefined;
      if (!m) throw new Fail(409, 'Nothing failed on this order');
      guardClaim(o);
      checkAmount(req, m.amount);
      const who = m === o.refund ? o.buyer.name : o.vendor.name;
      return gate(req, { service: 'food', summary: `Send ₦${m.amount.toLocaleString('en-NG')} to ${who} again (${o.orderRef})`, amount: m.amount, recipient: who, link: `/food/orders/${o.id}`, target: { kind: 'food-order', id: o.id } }, () => {
        m.status = 'processing';
        m.attempts += 1;
        addNote(o.id, 'Payment sent again');
        const next = db.foodOrders.find((x) => x.id !== o.id && (x.payout?.status === 'failed' || x.refund?.status === 'failed'));
        return receipt(m.amount, who, 'sent', next && { label: `Next failed payment: ${next.orderRef}`, link: `/food/orders/${next.id}` });
      });
    },
  },
  {
    method: 'GET',
    path: /^\/admin\/food\/disputes$/,
    needs: ['support', 'food'],
    handle: ({ params }) => ok(page(db.foodOrders.filter((o) => o.dispute && !o.dispute.resolved), params)),
  },
  {
    method: 'POST',
    path: /^\/admin\/food\/disputes\/([^/]+)\/resolve$/,
    needs: ['move_money', 'food'],
    code: true,
    log: (r) => `Ruled "${r.body.resolution === 'refund_buyer' ? 'refund buyer' : 'pay vendor'}" on ${db.foodOrders.find((o) => o.id === r.match[1])?.orderRef}`,
    handle: (req) => {
      const o = find(db.foodOrders, req.match[1], 'Order');
      if (!o.dispute || o.dispute.resolved) throw new Fail(409, 'This dispute is already settled');
      guardClaim(o);
      needReason(req);
      const refund = req.body.resolution === 'refund_buyer';
      const amount = refund ? o.total : o.subtotal;
      checkAmount(req, amount);
      const who = refund ? o.buyer.name : o.vendor.name;
      return gate(req, { service: 'food', summary: `${refund ? 'Refund' : 'Pay'} ₦${amount.toLocaleString('en-NG')} ${refund ? 'to' : 'to'} ${who} (${o.orderRef} ruling)`, amount, recipient: who, link: `/food/orders/${o.id}`, target: { kind: 'food-order', id: o.id } }, () => {
      o.dispute!.resolved = true;
      if (refund) {
        o.status = 'refunded';
        o.refund = { status: 'processing', amount: o.total, attempts: 1 };
      } else {
        o.status = 'completed';
        o.payout = { status: 'processing', amount: o.subtotal, attempts: 1 };
      }
      addNote(o.id, refund ? 'Ruled: refund the buyer' : 'Ruled: pay the vendor');
      const next = db.foodOrders.find((x) => x.id !== o.id && x.dispute && !x.dispute.resolved);
      return receipt(amount, who, 'sent', next && { label: `Next dispute: ${next.orderRef}`, link: `/food/orders/${next.id}` });
      });
    },
  },

  // DezenExpress
  {
    method: 'GET',
    path: /^\/admin\/express\/riders$/,
    needs: ['support', 'express'],
    handle: ({ params }) => ok(page(byStatus(db.riders, params.status).filter((r) => matches(params.q, r.name, r.plateNumber)), params)),
  },
  {
    method: 'PATCH',
    path: /^\/admin\/express\/riders\/([^/]+)\/verify$/,
    needs: ['verify', 'express'],
    log: (r) => `${r.body.status === 'verified' ? 'Approved' : 'Rejected'} rider ${db.riders.find((x) => x.id === r.match[1])?.name}`,
    handle: (req) => {
      const r = find(db.riders, req.match[1], 'Rider');
      if (req.body.status === 'rejected') needReason(req);
      r.status = req.body.status as typeof r.status;
      return ok(r);
    },
  },
  {
    method: 'POST',
    path: /^\/admin\/express\/riders\/([^/]+)\/wallet-adjustments$/,
    needs: ['move_money', 'express'],
    code: true,
    log: (r) => `${r.body.direction === 'credit' ? 'Added' : 'Took'} ₦${Number(r.body.amount).toLocaleString('en-NG')} ${r.body.direction === 'credit' ? 'to' : 'from'} ${db.riders.find((x) => x.id === r.match[1])?.name}'s wallet`,
    handle: (req) => {
      const r = find(db.riders, req.match[1], 'Rider');
      needReason(req);
      const amount = Number(req.body.amount);
      if (!(amount > 0)) throw new Fail(422, 'Enter an amount above zero');
      if (req.body.direction === 'debit' && amount > r.walletBalance) throw new Fail(409, 'That is more than the wallet holds');
      const credit = req.body.direction === 'credit';
      return gate(req, { service: 'express', summary: `${credit ? 'Add' : 'Take'} ₦${amount.toLocaleString('en-NG')} ${credit ? 'to' : 'from'} ${r.name}'s wallet`, amount, recipient: `${r.name}'s wallet`, link: '/express/riders?status=verified', target: { kind: 'rider-wallet', id: r.id } }, () => {
        r.walletBalance += credit ? amount : -amount;
        return receipt(amount, `${r.name}'s wallet, now ₦${r.walletBalance.toLocaleString('en-NG')}`, 'recorded');
      });
    },
  },
  {
    method: 'GET',
    path: /^\/admin\/express\/bookings$/,
    needs: ['support', 'express'],
    handle: ({ params }) => {
      let xs = db.bookings;
      if (params.status === 'to_refund') xs = xs.filter((b) => b.status === 'cancelled' && b.paymentStatus === 'paid');
      else xs = byStatus(xs, params.status);
      if (params.type) xs = xs.filter((b) => b.type === params.type);
      return ok(page(xs.filter((b) => matches(params.q, b.bookingRef, b.customer.name, b.rider?.name)), params));
    },
  },
  {
    method: 'GET',
    path: /^\/admin\/express\/bookings\/([^/]+)$/,
    needs: ['support', 'express'],
    handle: ({ match }) => {
      const b = find(db.bookings, match[1], 'Booking');
      const steps: [string, TimelineEntry['kind'], string?][] = [[`${b.customer.name} booked a ${b.type}`, 'status']];
      if (b.rider) steps.push([`${b.rider.name} accepted`, 'status']);
      if (b.paymentStatus !== 'unpaid') steps.push([`${b.customer.name} paid ₦${b.fare.toLocaleString('en-NG')}`, 'payment']);
      if (b.status === 'cancelled') steps.push(['Cancelled', 'status']);
      if (b.status === 'completed') steps.push(['Trip completed; rider credited', 'payment']);
      return ok({ ...b, timeline: [...db.timelineFor(b.createdAt, steps), ...(notes[b.id] ?? [])] });
    },
  },
  {
    method: 'POST',
    path: /^\/admin\/express\/bookings\/([^/]+)\/refund$/,
    needs: ['move_money', 'express'],
    code: true,
    log: (r) => `Refunded ${db.bookings.find((b) => b.id === r.match[1])?.bookingRef}`,
    handle: (req) => {
      const b = find(db.bookings, req.match[1], 'Booking');
      needReason(req);
      if (b.paymentStatus !== 'paid') throw new Fail(409, 'This trip has no payment to refund');
      if (Number(req.body.amount) !== b.fare) throw new Fail(422, 'The amount must match the fare paid');
      guardClaim(b);
      return gate(req, { service: 'express', summary: `Refund ₦${b.fare.toLocaleString('en-NG')} to ${b.customer.name} (${b.bookingRef})`, amount: b.fare, recipient: b.customer.name, link: `/express/bookings/${b.id}`, target: { kind: 'booking', id: b.id } }, () => {
        b.paymentStatus = 'refund_pending';
        addNote(b.id, 'Refund sent to the customer');
        const next = db.bookings.find((x) => x.id !== b.id && x.status === 'cancelled' && x.paymentStatus === 'paid');
        return receipt(b.fare, b.customer.name, 'sent', next && { label: `Next refund due: ${next.bookingRef}`, link: `/express/bookings/${next.id}` });
      });
    },
  },
  {
    method: 'GET',
    path: /^\/admin\/express\/withdrawals$/,
    needs: ['support', 'express'],
    handle: ({ params }) => {
      const xs = params.status === 'stuck' ? db.withdrawals.filter((w) => w.status === 'failed' || w.status === 'manual') : byStatus(db.withdrawals, params.status);
      const pending = (id: string) => db.approvals.some((a) => a.status === 'pending' && a.target.id === id);
      return ok(page(xs.filter((w) => matches(params.q, w.rider.name)).map((w) => ({ ...w, awaitingApproval: pending(w.id) })), params));
    },
  },
  {
    method: 'POST',
    path: /^\/admin\/express\/withdrawals\/([^/]+)\/retry$/,
    needs: ['move_money', 'express'],
    code: true,
    log: (r) => `Retried a withdrawal for ${db.withdrawals.find((w) => w.id === r.match[1])?.rider.name}`,
    handle: (req) => {
      const w = find(db.withdrawals, req.match[1], 'Withdrawal');
      if (w.status !== 'failed') throw new Fail(409, 'Only a failed withdrawal can be sent again');
      guardClaim(w);
      checkAmount(req, w.amount);
      if (db.approvals.some((a) => a.status === 'pending' && a.target.id === w.id)) {
        throw new Fail(409, 'A request to send this is already waiting for approval');
      }
      const to = `${w.rider.name} · ${w.bank} ${w.accountNumberMasked}`;
      return gate(req, { service: 'express', summary: `Send ₦${w.amount.toLocaleString('en-NG')} to ${w.rider.name} again`, amount: w.amount, recipient: to, link: '/express/withdrawals?status=stuck', target: { kind: 'withdrawal', id: w.id } }, () => {
        w.status = 'processing';
        w.attempts += 1;
        return receipt(w.amount, to, 'sent');
      });
    },
  },
  {
    method: 'POST',
    path: /^\/admin\/express\/withdrawals\/([^/]+)\/mark-paid$/,
    needs: ['move_money', 'express'],
    code: true,
    log: (r) => `Recorded a hand-paid withdrawal for ${db.withdrawals.find((w) => w.id === r.match[1])?.rider.name}`,
    handle: (req) => {
      const w = find(db.withdrawals, req.match[1], 'Withdrawal');
      needReason(req);
      if (!String(req.body.transferReference ?? '').trim()) throw new Fail(422, 'Enter the bank transfer reference');
      if (w.status !== 'manual' && w.status !== 'failed') throw new Fail(409, 'This withdrawal is not waiting to be paid by hand');
      guardClaim(w);
      checkAmount(req, w.amount);
      const to = `${w.rider.name} · ${w.bank} ${w.accountNumberMasked}`;
      return gate(req, { service: 'express', summary: `Record ₦${w.amount.toLocaleString('en-NG')} paid by hand to ${w.rider.name}`, amount: w.amount, recipient: to, link: '/express/withdrawals?status=stuck', target: { kind: 'withdrawal', id: w.id } }, () => {
        w.status = 'paid';
        return receipt(w.amount, to, 'recorded');
      });
    },
  },
  {
    method: 'GET',
    path: /^\/admin\/express\/providers$/,
    needs: ['support', 'express'],
    handle: ({ params }) => ok(page(byStatus(db.providers, params.status), params)),
  },
  {
    method: 'PATCH',
    path: /^\/admin\/express\/providers\/([^/]+)\/verify$/,
    needs: ['verify', 'express'],
    log: (r) => `${r.body.status === 'verified' ? 'Approved' : 'Rejected'} delivery company ${db.providers.find((p) => p.id === r.match[1])?.name}`,
    handle: (req) => {
      const p = find(db.providers, req.match[1], 'Delivery company');
      if (req.body.status === 'rejected') needReason(req);
      p.status = req.body.status as typeof p.status;
      return ok(p);
    },
  },

  // Shopping
  {
    method: 'GET',
    path: /^\/admin\/shopping\/orders$/,
    needs: ['support', 'shopping'],
    handle: ({ params }) => ok(page(byStatus(db.shopOrders, params.status).filter((o) => matches(params.q, o.orderRef, o.product.name, o.buyer.name, o.seller.name)), params)),
  },
  {
    method: 'GET',
    path: /^\/admin\/shopping\/orders\/([^/]+)$/,
    needs: ['support', 'shopping'],
    handle: ({ match }) => {
      const o = find(db.shopOrders, match[1], 'Order');
      const steps: [string, TimelineEntry['kind'], string?][] = [
        [`${o.buyer.name} ordered ${o.quantity} × ${o.product.name}`, 'status'],
        [`${o.buyer.name} paid ${o.amount} ${o.currency}; held until delivery is confirmed`, 'payment'],
      ];
      if (['shipped', 'delivered', 'completed', 'disputed'].includes(o.status)) steps.push([`${o.seller.name} shipped it`, 'status']);
      if (o.status === 'completed') steps.push(['Buyer confirmed delivery; seller paid', 'payment']);
      if (o.status === 'disputed') steps.push(['A dispute was opened', 'message']);
      return ok({ ...o, timeline: [...db.timelineFor(o.createdAt, steps), ...(notes[o.id] ?? [])] });
    },
  },
  {
    method: 'GET',
    path: /^\/admin\/shopping\/disputes$/,
    needs: ['support', 'shopping'],
    handle: ({ params }) => ok(page(db.shopDisputes, params)),
  },
  {
    method: 'POST',
    path: /^\/admin\/shopping\/disputes\/([^/]+)\/ruling$/,
    needs: ['move_money', 'shopping'],
    code: true,
    log: (r) => `Ruled "${r.body.resolution === 'refund_buyer' ? 'refund buyer' : 'release payment to seller'}" on ${db.shopDisputes.find((d) => d.id === r.match[1])?.order.orderRef}`,
    handle: (req) => {
      const d = find(db.shopDisputes, req.match[1], 'Dispute');
      if (d.ruling) throw new Fail(409, 'This dispute already has a ruling');
      guardClaim(d);
      checkAmount(req, d.order.amount);
      d.ruling = { resolution: req.body.resolution as 'refund_buyer' | 'release_to_seller', by: EMAIL, at: now(), note: needReason(req), carriedOut: false };
      const who = d.ruling.resolution === 'refund_buyer' ? d.order.buyer.name : d.order.seller.name;
      return ok(receipt(d.order.amount, `${who}, once an owner carries it out`, 'recorded', undefined, d.order.currency));
    },
  },
  {
    method: 'GET',
    path: /^\/admin\/shopping\/products$/,
    needs: ['support', 'shopping'],
    handle: ({ params }) => {
      let xs = db.products;
      if (params.status === 'reported') xs = xs.filter((p) => p.reports > 0);
      if (params.status === 'hidden') xs = xs.filter((p) => !p.visible);
      return ok(page(xs.filter((p) => matches(params.q, p.name, p.seller.name)), params));
    },
  },
  {
    method: 'POST',
    path: /^\/admin\/shopping\/products\/([^/]+)\/(hide|show)$/,
    needs: ['verify', 'shopping'],
    log: (r) => `${r.match[2] === 'hide' ? 'Hid' : 'Showed'} product ${db.products.find((p) => p.id === r.match[1])?.name}`,
    handle: (req) => {
      const p = find(db.products, req.match[1], 'Product');
      if (req.match[2] === 'hide') needReason(req);
      p.visible = req.match[2] === 'show';
      if (p.visible) p.reports = 0;
      return ok(p);
    },
  },
  {
    method: 'PUT',
    path: /^\/admin\/shopping\/products\/([^/]+)\/sponsored$/,
    needs: ['verify', 'shopping'],
    log: (r) => `${r.body.sponsored ? 'Sponsored' : 'Stopped sponsoring'} ${db.products.find((p) => p.id === r.match[1])?.name}`,
    handle: (req) => {
      const p = find(db.products, req.match[1], 'Product');
      p.sponsored = Boolean(req.body.sponsored);
      return ok(p);
    },
  },
  {
    method: 'GET',
    path: /^\/admin\/shopping\/sellers$/,
    needs: ['support', 'shopping'],
    handle: ({ params }) => ok(page(db.sellers.filter((s) => matches(params.q, s.name)), params)),
  },

  // people
  {
    method: 'GET',
    path: /^\/admin\/platform\/users$/,
    needs: ['support', 'platform'],
    handle: ({ params }) =>
      ok(page(db.people.filter((p) => matches(params.q, p.name, p.email, p.phone)).map(({ email: _e, phone: _p, address: _a, bankName: _b, accountNumber: _n, ...rest }) => rest), params)),
  },
  {
    method: 'GET',
    path: /^\/admin\/platform\/users\/([^/]+)$/,
    needs: ['support', 'platform'],
    handle: ({ match }) => {
      const p = find(db.people, match[1], 'Person');
      const { email: _e, phone: _p, address: _a, bankName: _b, accountNumber: _n, ...summary } = p;
      const activity = [
        ...db.foodOrders.filter((o) => o.buyer.id === p.id).map((o) => ({ service: 'food' as const, kind: 'order' as const, ref: o.orderRef, status: o.status, amount: o.total, currency: 'NGN', at: o.createdAt, link: `/food/orders/${o.id}` })),
        ...db.bookings.filter((b) => b.customer.id === p.id).map((b) => ({ service: 'express' as const, kind: 'booking' as const, ref: b.bookingRef, status: b.status, amount: b.fare, currency: 'NGN', at: b.createdAt, link: `/express/bookings/${b.id}` })),
        ...db.shopOrders.filter((o) => o.buyer.id === p.id).map((o) => ({ service: 'shopping' as const, kind: 'order' as const, ref: o.orderRef, status: o.status, amount: o.amount, currency: o.currency, at: o.createdAt, link: `/shopping/orders/${o.id}` })),
      ].sort((a, b) => b.at.localeCompare(a.at));
      const refs = new Set(activity.map((a) => a.ref));
      return ok({ ...summary, activity, payments: db.payments.filter((x) => [...refs].some((r) => x.purpose.includes(r))) });
    },
  },
  {
    method: 'POST',
    path: /^\/admin\/platform\/users\/([^/]+)\/reveal$/,
    needs: ['read_pii', 'platform'],
    code: true,
    log: (r) => `Viewed full details of ${db.people.find((p) => p.id === r.match[1])?.name}`,
    handle: (req) => {
      const p = find(db.people, req.match[1], 'Person');
      needReason(req);
      return ok({ email: p.email, phone: p.phone, address: p.address, bankName: p.bankName, accountNumber: p.accountNumber });
    },
  },

  // money
  {
    method: 'GET',
    path: /^\/admin\/platform\/payments$/,
    needs: ['support', 'platform'],
    handle: ({ params }) => {
      let xs = db.payments;
      if (params.status) xs = xs.filter((p) => p.status === params.status);
      if (params.type) xs = xs.filter((p) => p.service === params.type);
      return ok(page(xs.filter((p) => matches(params.q, p.reference, p.purpose)), params, 25));
    },
  },
  {
    method: 'GET',
    path: /^\/admin\/platform\/webhooks$/,
    needs: ['support', 'platform'],
    handle: ({ params }) => ok(page(params.status === 'problems' ? db.webhooks.filter((w) => !w.handled) : db.webhooks, params, 25)),
  },
  { method: 'GET', path: /^\/admin\/platform\/reconciliation$/, needs: ['move_money', 'platform'], handle: () => ok(db.reconciliation) },

  // settings
  { method: 'GET', path: /^\/admin\/platform\/settings$/, needs: ['support', 'platform'], handle: () => ok(db.settings) },
  {
    method: 'PUT',
    path: /^\/admin\/platform\/settings$/,
    needs: ['staff_admin', 'platform'],
    code: true,
    log: () => 'Changed fees and fares',
    handle: (req) => {
      needReason(req);
      const { reason: _r, ...changes } = req.body as Partial<Settings> & { reason?: string };
      Object.assign(db.settings, changes, { updatedAt: now(), updatedBy: EMAIL });
      return ok(db.settings);
    },
  },

  // staff
  { method: 'GET', path: /^\/admin\/staff$/, needs: ['staff_admin', 'platform'], handle: () => ok({ staff: db.staff, presets: { support: ['support'], verifier: ['support', 'verify'], finance: ['support', 'read_pii', 'move_money'], owner: ['support', 'verify', 'read_pii', 'move_money', 'staff_admin'] } }) },
  {
    method: 'POST',
    path: /^\/admin\/staff$/,
    needs: ['staff_admin', 'platform'],
    code: true,
    log: (r) => `Gave ${r.body.email} ${r.body.preset} access`,
    handle: (req) => {
      const email = String(req.body.email).toLowerCase();
      if (email === EMAIL) throw new Fail(409, 'You cannot change your own access');
      const presets: Record<string, Capability[]> = { support: ['support'], verifier: ['support', 'verify'], finance: ['support', 'read_pii', 'move_money'], owner: ['support', 'verify', 'read_pii', 'move_money', 'staff_admin'] };
      const existing = db.staff.find((s) => s.email === email);
      const row = existing ?? { id: `s${db.staff.length + 1}`, name: email.split('@')[0], email, capabilities: [], services: [], authenticatorSet: false, disabled: false, createdAt: now() };
      row.capabilities = presets[String(req.body.preset)];
      row.services = req.body.services as typeof row.services;
      row.disabled = false;
      if (!existing) db.staff.push(row);
      return ok(row);
    },
  },
  {
    method: 'POST',
    path: /^\/admin\/staff\/([^/]+)\/(disable|enable|reset-authenticator)$/,
    needs: ['staff_admin', 'platform'],
    code: true,
    log: (r) => `${{ disable: 'Removed access for', enable: 'Restored access for', 'reset-authenticator': 'Reset the authenticator of' }[r.match[2]]} ${db.staff.find((s) => s.id === r.match[1])?.email}`,
    handle: ({ match }) => {
      const s = find(db.staff, match[1], 'Staff member');
      if (s.email === EMAIL) throw new Fail(409, 'You cannot change your own access');
      if (match[2] === 'disable') s.disabled = true;
      if (match[2] === 'enable') s.disabled = false;
      if (match[2] === 'reset-authenticator') s.authenticatorSet = false;
      return ok(s);
    },
  },

  // activity log
  {
    method: 'GET',
    path: /^\/admin\/audit$/,
    needs: ['staff_admin', 'platform'],
    handle: ({ params }) => ok(page(db.audit.filter((a) => (!params.service || a.service === params.service) && matches(params.q, a.staffEmail, a.summary)), params, 25)),
  },
];

// ── dispatcher ───────────────────────────────────────────────────────────────

let requestNo = 100;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sampleBaseQuery(args: string | FetchArgs): Promise<Result> {
  const a = typeof args === 'string' ? { url: args } : args;
  const method = (a.method ?? 'GET').toUpperCase();
  const [path, query] = a.url.split('?');
  const params: Record<string, string> = Object.fromEntries(new URLSearchParams(query ?? ''));
  for (const [k, v] of Object.entries((a.params as Record<string, unknown>) ?? {})) if (v !== undefined && v !== '') params[k] = String(v);
  const headers = (a.headers ?? {}) as Record<string, string>;
  const body = (a.body as Record<string, unknown>) ?? {};

  await wait(250 + Math.random() * 250);

  const route = routes.find((r) => r.method === method && r.path.test(path));
  if (!route) return { error: { status: 404, data: { status: 'fail', message: `Sample backend has no ${method} ${path}` } } };
  const req: Req = { method, params, body, code: headers['X-Admin-Code'], match: path.match(route.path)! };

  const r = role();
  const logIt = (outcome: AuditEvent['outcome']) => {
    if (!route.log) return;
    db.audit.unshift({
      id: `a${++requestNo}`,
      staffEmail: EMAIL,
      capability: route.needs?.[0],
      service: route.needs?.[1],
      summary: outcome === 'done' ? (req.gated ? `Asked for approval: ${route.log(req)}` : route.log(req)) : `Tried: ${route.log(req)}`,
      action: `${method} ${path}`,
      reason: (body.reason ?? body.note) as string | undefined,
      outcome,
      requestId: `req-${requestNo}`,
      at: now(),
    });
  };

  try {
    if (route.needs) {
      const [cap, service] = route.needs;
      if (!r.capabilities.includes(cap) || !(r.services.includes('*') || r.services.includes(service))) {
        throw new Fail(403, 'Your staff access does not cover this');
      }
    }
    if (route.code) {
      if (!req.code) throw new Fail(401, 'Enter the code from your authenticator app to confirm');
      if (req.code === '000000') throw new Fail(401, 'That code is not right; try the current one');
    }
    // A copy: the store freezes what it receives, and these records must stay editable.
    const data = structuredClone(route.handle(req));
    logIt('done');
    return { data };
  } catch (e) {
    if (e instanceof Fail) {
      if (e.status === 403) logIt('refused');
      else if (method !== 'GET') logIt('failed');
      return { error: { status: e.status, data: { status: 'fail', message: e.message } } };
    }
    throw e;
  }
}
