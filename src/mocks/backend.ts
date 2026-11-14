import type { FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { Approval, AuditEvent, Capability, Claim, ClaimKind, HomeData, HomeGroup, HomeNext, HomeRow, MoneyReceipt, QueueItem, QueueKey, QueueTop, ReviewCase, ReviewKind, Withdrawal, SearchResult, Service, Settings, TimelineEntry } from '../store/types';
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
  amountNgn?: number,
): MoneyReceipt => {
  if (state === 'sent' || (state === 'recorded' && !recipient.includes('once an owner'))) {
    const who = recipient.split(' · ')[0].split(',')[0];
    db.settled.unshift({ text: state === 'sent' ? `${who} was paid` : `${who} is settled`, amount: amountNgn ?? amount, currency: amountNgn ? 'NGN' : currency, by: EMAIL, at: now() });
  }
  return { reference: `DZ-${++refNo}`, amount, currency, amountNgn, recipient, state, at: now(), by: EMAIL, next };
};
/** The typed amount must match what will move. */
const checkAmount = (req: Req, expected: number) => {
  if (Number(req.body.amount) !== expected) throw new Fail(422, `The amount must be exactly ${expected.toLocaleString('en-NG')}`);
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// ── claims ───────────────────────────────────────────────────────────────────

const NAME = 'You';
/** Refuse a money action on a record someone else is handling. */
/** A claim lapses after 2 hours without activity, so a forgotten "I'm on it" never blocks the queue. */
const CLAIM_LAPSE_MS = 2 * 3600_000;
const lapseClaims = () => {
  const t = Date.now();
  for (const rec of [...db.foodOrders, ...db.bookings, ...db.withdrawals, ...db.shopDisputes] as { claim?: Claim | null }[])
    if (rec.claim && t - new Date(rec.claim.activeAt ?? rec.claim.since).getTime() > CLAIM_LAPSE_MS) rec.claim = null;
};
const guardClaim = (rec: { claim?: Claim | null }) => {
  if (rec.claim && rec.claim.by === EMAIL) rec.claim.activeAt = now();
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

/**
 * People first (customers, riders, kitchens), then their orders, trips and payments, at most eight of
 * each kind, so a common name never pushes the person out of the results.
 */
const search = (q: string): SearchResult[] => {
  if (q.trim().length < 2) return [];
  const people: SearchResult[] = [];
  const things: SearchResult[] = [];
  for (const p of db.people) if (matches(q, p.name, p.email, p.phone, p.accountNumber)) people.push({ kind: 'person', service: 'platform', id: p.id, title: p.name, subtitle: `Customer · ${p.emailMasked} · joined ${new Date(p.joinedAt).getFullYear()}`, link: `/people/${p.id}` });
  for (const r of db.riders) if (matches(q, r.name, r.plateNumber, r.phone)) people.push({ kind: 'rider', service: 'express', id: r.id, title: r.name, subtitle: `Rider · ${r.vehicleType} · ${r.plateNumber}`, link: `/express/riders/${r.id}`, status: r.status });
  for (const v of db.vendors) if (matches(q, v.businessName, v.ownerName)) people.push({ kind: 'vendor', service: 'food', id: v.id, title: v.businessName, subtitle: `Kitchen · ${v.ownerName} · ${v.lga}, ${v.state}`, link: `/food/vendors/${v.id}`, status: v.status });
  for (const o of db.foodOrders) if (matches(q, o.orderRef, o.buyer.name, o.vendor.name)) things.push({ kind: 'order', service: 'food', id: o.id, title: o.orderRef, subtitle: `${o.vendor.name} · ${o.buyer.name}`, link: `/food/orders/${o.id}`, status: o.dispute && !o.dispute.resolved ? 'disputed' : o.status, amount: o.total });
  for (const x of db.bookings) if (matches(q, x.bookingRef, x.customer.name, x.rider?.name)) things.push({ kind: 'booking', service: 'express', id: x.id, title: x.bookingRef, subtitle: `${x.customer.name} · ${x.pickup} → ${x.dropoff}`, link: `/express/bookings/${x.id}`, status: x.status === 'cancelled' && x.paymentStatus === 'paid' ? 'to_refund' : x.status, amount: x.fare });
  for (const o of db.shopOrders) if (matches(q, o.orderRef, o.buyer.name, o.seller.name, o.product.name)) things.push({ kind: 'order', service: 'shopping', id: o.id, title: o.orderRef, subtitle: `${o.product.name} · ${o.buyer.name}`, link: `/shopping/orders/${o.id}`, status: o.status, amount: o.amountNgn });
  for (const p of db.payments) if (matches(q, p.reference)) things.push({ kind: 'payment', service: p.service, id: p.id, title: p.reference, subtitle: p.purpose, link: `/money/payments?q=${p.reference}`, status: p.status, amount: p.amount });
  const r = role();
  // Only what the person may open: customers and payments need platform access.
  const mayOpen = (x: SearchResult) =>
    (r.services.includes('*') || r.services.includes(x.kind === 'person' || x.kind === 'payment' ? 'platform' : x.service)) &&
    r.capabilities.includes('support');
  const capped = (xs: SearchResult[]) => {
    const seen = new Map<string, number>();
    return xs.filter((x) => {
      const n = (seen.get(x.kind) ?? 0) + 1;
      seen.set(x.kind, n);
      return n <= 8;
    });
  };
  return capped([...people, ...things].filter(mayOpen));
};

// The seeded approval: approving it sends the 180,000 withdrawal again.
performers.set('ap1', () => {
  const w = db.withdrawals.find((x) => x.id === 'w0101')!;
  w.status = 'processing';
  w.attempts += 1;
  return receipt(w.amount, `${w.rider.name} · ${w.bank} ${w.accountNumberMasked}`, 'sent');
});

/** A review queue lists whoever has waited longest first. */
const oldestFirst = <T extends { createdAt: string }>(status: string | undefined, xs: T[]) => (status === 'pending' ? [...xs].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : xs);

// ── reviews ──────────────────────────────────────────────────────────────────

const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
const reviewCase = (kind: ReviewKind, id: string): ReviewCase => {
  if (kind === 'rider') {
    const r = find(db.riders, id, 'Rider');
    return {
      kind, id, service: 'express', name: r.name, summary: `${r.vehicleType} · ${r.plateNumber}`, status: r.status, appliedAt: r.createdAt,
      facts: [
        { label: 'Phone', value: r.phone },
        { label: 'Vehicle', value: r.vehicleType },
        { label: 'Plate', value: r.plateNumber },
        { label: 'Licence number', value: r.licenceNumber },
        { label: 'Pays out to', value: r.payoutAccount ? `${r.payoutAccount.accountName} · ${r.payoutAccount.bankName} ${r.payoutAccount.accountNumberMasked}` : 'No account yet' },
      ],
      documents: [
        { id: 'licence', label: "Driver's licence", caption: `Uploaded ${shortDay(r.createdAt)}` },
        { id: 'plate', label: 'Vehicle with its plate', caption: r.plateNumber },
        { id: 'face', label: 'Photo of the rider', caption: 'Taken in the app' },
      ],
      checks: [
        { id: 'licence-name', label: 'Name on the licence matches', expected: r.name },
        { id: 'licence-date', label: 'Licence is in date', expected: `Licence ${r.licenceNumber}` },
        { id: 'plate', label: 'Plate in the photo matches', expected: r.plateNumber },
        { id: 'face', label: 'Face matches the licence photo' },
        ...(r.payoutAccount ? [{ id: 'payout-name', label: 'Payout account is in their name', expected: r.payoutAccount.accountName }] : []),
      ],
      rejectionReason: (r as { rejectionReason?: string }).rejectionReason,
    };
  }
  if (kind === 'vendor') {
    const v = find(db.vendors, id, 'Vendor');
    return {
      kind, id, service: 'food', name: v.businessName, summary: `${v.ownerName} · ${v.lga}, ${v.state}`, status: v.status, appliedAt: v.createdAt,
      facts: [
        { label: 'Owner', value: v.ownerName },
        { label: 'Phone', value: v.phone },
        { label: 'Address', value: v.address },
        { label: 'Sells', value: v.categories.join(', ') },
        { label: 'Pays out to', value: `${v.payoutAccount.accountName} · ${v.payoutAccount.bankName} ${v.payoutAccount.accountNumberMasked}` },
      ],
      documents: [
        { id: 'kitchen', label: 'The kitchen', caption: v.address },
        { id: 'owner-id', label: "Owner's ID", caption: v.ownerName },
        { id: 'food', label: 'A dish they sell', caption: v.categories[0] },
      ],
      checks: [
        { id: 'owner-id', label: 'ID matches the owner', expected: v.ownerName },
        { id: 'kitchen', label: 'Kitchen photo is a real, clean kitchen' },
        { id: 'address', label: 'Address is a real place we deliver to', expected: `${v.lga}, ${v.state}` },
        { id: 'payout-name', label: 'Payout name matches the owner or the business', expected: v.payoutAccount.accountName },
      ],
      rejectionReason: v.rejectionReason,
    };
  }
  const p = find(db.providers, id, 'Delivery company');
  return {
    kind, id, service: 'express', name: p.name, summary: `Covers ${p.coverage.join(', ')}`, status: p.status, appliedAt: p.createdAt,
    facts: [
      { label: 'Email', value: p.email },
      { label: 'Phone', value: p.phone },
      { label: 'Covers', value: p.coverage.join(', ') },
    ],
    documents: [
      { id: 'cac', label: 'Business registration', caption: p.name },
      { id: 'fleet', label: 'Their vehicles', caption: 'Photo of the fleet' },
    ],
    checks: [
      { id: 'cac-name', label: 'Registered name matches', expected: p.name },
      { id: 'contact', label: 'Called the number and someone answered', expected: p.phone },
      { id: 'coverage', label: 'They really deliver in those states', expected: p.coverage.join(', ') },
    ],
    rejectionReason: (p as { rejectionReason?: string }).rejectionReason,
  };
};
/** Approve only with every check ticked; the ticks are saved with the decision. */
const checksDone = (req: Req, kind: ReviewKind, id: string) => {
  const need = reviewCase(kind, id).checks.map((c) => c.id);
  const got = new Set((req.body.checks as string[] | undefined) ?? []);
  const missing = need.filter((c) => !got.has(c));
  if (missing.length) throw new Fail(422, `Tick every check before approving (${missing.length} left)`);
};

// ── home ─────────────────────────────────────────────────────────────────────

const HOUR = 3_600_000;
const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / HOUR;
const ageWords = (iso: string) => {
  const h = hoursSince(iso);
  return h < 1 ? 'under an hour' : h < 48 ? `${Math.floor(h)} hours` : `${Math.floor(h / 24)} days`;
};
const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;
const s = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** The promise: money within a day, rulings and reviews within two. */
const PROMISE_H = { pay: 24, approve: 24, rule: 48, review: 48 } as const;

/** Everyone else holding items in a row: "Femi on 1". */
const claimers = (items: { claim?: Claim | null }[]) => {
  const out = new Map<string, number>();
  for (const it of items) if (it.claim && it.claim.by !== EMAIL) out.set(it.claim.name, (out.get(it.claim.name) ?? 0) + 1);
  return [...out].map(([name, count]) => ({ name, count }));
};

type Cand = HomeNext & { verb: keyof typeof PROMISE_H; rank: number; claimedByOther: boolean; queue: QueueKey };

/** Every individual thing waiting on staff that this person's access covers, each with its own age. */
const candidates = (): Cand[] => {
  const r = role();
  const covers = (svc: Service) => r.services.includes('*') || r.services.includes(svc);
  const can = (cap: Capability, svc: Service) => r.capabilities.includes(cap) && covers(svc);
  const awaiting = (id: string) => db.approvals.some((a) => a.status === 'pending' && a.target.id === id);
  const cands: Cand[] = [];

  const approvals = db.approvals.filter((a) => a.status === 'pending' && a.requestedBy !== EMAIL && can('move_money', a.service));
  for (const a of approvals)
    cands.push({ verb: 'approve', rank: 0, claimedByOther: false, queue: 'approvals', kind: 'Second approval', service: a.service, title: `${(db.staff.find((x) => x.email === a.requestedBy)?.name ?? a.requestedBy).split(' ')[0]} needs your second approval for ${naira(a.amount)}`, why: `${a.summary}. They said: “${a.reason}”.`, amount: a.amount, waitingSince: a.requestedAt, link: '/approvals' });

  const stuck = db.withdrawals.filter((w) => (w.status === 'failed' || w.status === 'manual') && !awaiting(w.id));
  if (covers('express'))
    for (const w of stuck)
      cands.push({ verb: 'pay', rank: w.status === 'failed' && /name does not match|invalid account|account not found|insufficient balance/i.test(w.lastError ?? '') && !w.bankDetailsUpdatedAt ? 1.5 : 1, claimedByOther: !!w.claim && w.claim.by !== EMAIL, yours: w.claim?.by === EMAIL, queue: 'withdrawals', kind: 'Rider withdrawal', service: 'express', title: `${w.rider.name} has waited ${ageWords(w.requestedAt)} for ${naira(w.amount)}`, why: w.status !== 'failed' ? 'No checked bank account: send it from the bank, then record it here.' : /name does not match|invalid account|account not found/i.test(w.lastError ?? '') ? `The bank said: ${w.lastError}. Sending again will fail too, so ask them to fix their bank details in the app.` : /insufficient balance/i.test(w.lastError ?? '') ? 'Our payout wallet ran short. Top it up, then send again; the same payment reference is reused.' : `The bank turned it back: ${w.lastError}. Sending again is safe; the same payment reference is reused.`, amount: w.amount, waitingSince: w.requestedAt, link: '/express/withdrawals?status=stuck', claim: { kind: 'withdrawal', id: w.id } });

  const refunds = db.bookings.filter((b) => b.status === 'cancelled' && b.paymentStatus === 'paid');
  if (covers('express'))
    for (const b of refunds)
      cands.push({ verb: 'pay', rank: 1, claimedByOther: !!b.claim && b.claim.by !== EMAIL, yours: b.claim?.by === EMAIL, queue: 'refunds', kind: 'Refund due', service: 'express', title: `${b.customer.name} has waited ${ageWords(b.createdAt)} for a ${naira(b.fare)} refund`, why: 'They paid for a trip that was cancelled. The full fare goes back to the account they paid from.', amount: b.fare, waitingSince: b.createdAt, link: `/express/bookings/${b.id}`, claim: { kind: 'booking', id: b.id } });

  const failedFood = db.foodOrders.filter((o) => o.payout?.status === 'failed' || o.refund?.status === 'failed');
  if (covers('food'))
    for (const o of failedFood) {
      const refund = o.refund?.status === 'failed';
      const m = refund ? o.refund! : o.payout!;
      cands.push({ verb: 'pay', rank: 1, claimedByOther: !!o.claim && o.claim.by !== EMAIL, yours: o.claim?.by === EMAIL, queue: 'food-money', kind: refund ? 'Buyer refund' : 'Vendor payout', service: 'food', title: `${refund ? o.buyer.name : o.vendor.name} has waited ${ageWords(o.createdAt)} for ${naira(m.amount)}`, why: `The bank said: ${m.lastError}. Tried ${m.attempts} times; sending again reuses the same reference.`, amount: m.amount, waitingSince: o.createdAt, link: `/food/orders/${o.id}`, claim: { kind: 'food-order', id: o.id } });
    }

  const foodDisputes = db.foodOrders.filter((o) => o.dispute && !o.dispute.resolved);
  if (covers('food'))
    for (const o of foodDisputes)
      cands.push({ verb: 'rule', rank: 2, claimedByOther: !!o.claim && o.claim.by !== EMAIL, yours: o.claim?.by === EMAIL, queue: 'food-disputes', kind: 'Dispute', service: 'food', title: `${o.buyer.name} is waiting for a ruling on ${o.orderRef}`, why: `“${o.dispute!.reason}” · ${naira(o.total)} at stake between them and ${o.vendor.name}.`, amount: o.total, waitingSince: o.dispute!.openedAt, link: `/food/orders/${o.id}`, claim: { kind: 'food-order', id: o.id } });

  const shopDisputes = db.shopDisputes.filter((d) => !d.ruling);
  if (covers('shopping'))
    for (const d of shopDisputes)
      cands.push({ verb: 'rule', rank: 2, claimedByOther: !!d.claim && d.claim.by !== EMAIL, yours: d.claim?.by === EMAIL, queue: 'shop-disputes', kind: 'Dispute', service: 'shopping', title: `${d.order.buyer.name} and ${d.order.seller.name} are waiting for a ruling`, why: `“${d.reason}” · ₦${d.order.amountNgn.toLocaleString('en-NG')} on ${d.order.orderRef}.`, waitingSince: d.openedAt, link: '/shopping/disputes', claim: { kind: 'shop-dispute', id: d.id } });

  const riders = byStatus(db.riders, 'pending');
  if (covers('express'))
    for (const x of riders)
      cands.push({ verb: 'review', rank: 3, claimedByOther: false, queue: 'riders', kind: 'Rider to review', service: 'express', title: `${x.name} can't drive until someone checks their licence`, why: `${x.vehicleType} · plate ${x.plateNumber} · licence ${x.licenceNumber}.`, waitingSince: x.createdAt, link: `/express/riders/${x.id}` });
  const vendors = byStatus(db.vendors, 'pending');
  if (covers('food'))
    for (const v of vendors)
      cands.push({ verb: 'review', rank: 3, claimedByOther: false, queue: 'vendors', kind: 'Kitchen to review', service: 'food', title: `${v.businessName} is ready to sell`, why: `Check the address (${v.lga}, ${v.state}) and that the payout name matches ${v.ownerName}.`, waitingSince: v.createdAt, link: `/food/vendors/${v.id}` });

  const providers = byStatus(db.providers, 'pending');
  if (covers('express'))
    for (const x of providers)
      cands.push({ verb: 'review', rank: 3, claimedByOther: false, queue: 'providers', kind: 'Delivery company to review', service: 'express', title: `${x.name} wants to deliver for Dezen`, why: `Check their registration and that they really cover ${x.coverage.join(', ')}.`, waitingSince: x.createdAt, link: `/express/providers/${x.id}` });
  const reported = db.products.filter((p) => p.reports > 0 && p.visible);
  if (covers('shopping'))
    for (const x of reported)
      cands.push({ verb: 'review', rank: 3, claimedByOther: false, queue: 'products', kind: 'Reported product', service: 'shopping', title: `${s(x.reports, 'buyer reported', 'buyers reported')} ${x.name}`, why: `Sold by ${x.seller.name}. Read what they said, then hide it or keep it.`, waitingSince: x.createdAt, link: '/shopping/products?status=reported' });
  return cands;
};

const RANK_LATE = (c: Cand) => hoursSince(c.waitingSince) > PROMISE_H[c.verb];
const canDoFor = (c: Cand) => {
  const r = role();
  const covers = r.services.includes('*') || r.services.includes(c.service);
  return covers && r.capabilities.includes(c.verb === 'review' ? 'verify' : 'move_money');
};

/** The top of one queue page: counts against our promise and the one person to take next. */
const queueTop = (key: QueueKey): QueueTop => {
  const items = candidates().filter((c) => c.queue === key);
  const verb = items[0]?.verb ?? ({ approvals: 'approve', withdrawals: 'pay', refunds: 'pay', 'food-money': 'pay', 'food-disputes': 'rule', 'shop-disputes': 'rule' } as Record<string, keyof typeof PROMISE_H>)[key] ?? 'review';
  const mine = items.find((c) => c.yours);
  // Something this person can finish now comes first; within that, whoever has waited longest.
  const pick = mine ?? [...items].filter((c) => canDoFor(c) && !c.claimedByOther).sort((a, b) => a.rank - b.rank || a.waitingSince.localeCompare(b.waitingSince))[0];
  const claimed = new Map<string, number>();
  for (const c of items) if (c.claimedByOther) {
    const rec = c.claim ? claimable(c.claim.kind, c.claim.id).rec : null;
    if (rec?.claim) claimed.set(rec.claim.name, (claimed.get(rec.claim.name) ?? 0) + 1);
  }
  const strip = (c?: Cand): HomeNext | null => {
    if (!c) return null;
    const { verb, rank: _r, claimedByOther: _c, queue: _q, ...n } = c;
    return { ...n, promiseHours: PROMISE_H[verb] };
  };
  return {
    key,
    promiseHours: PROMISE_H[verb],
    waitingPeople: items.length,
    latePeople: items.filter(RANK_LATE).length,
    oldestAt: [...items.map((c) => c.waitingSince)].sort()[0],
    claimedBy: [...claimed].map(([name, count]) => ({ name, count })),
    canAct: items.length ? items.some(canDoFor) : true,
    next: strip(pick),
  };
};

const home = (): HomeData => {
  const r = role();
  const covers = (svc: Service) => r.services.includes('*') || r.services.includes(svc);
  const can = (cap: Capability, svc: Service) => r.capabilities.includes(cap) && covers(svc);
  const oldestOf = (dates: string[]) => [...dates].sort()[0];
  const awaiting = (id: string) => db.approvals.some((a) => a.status === 'pending' && a.target.id === id);

  const cands = candidates();
  const approvals = db.approvals.filter((a) => a.status === 'pending' && a.requestedBy !== EMAIL && can('move_money', a.service));
  const stuck = db.withdrawals.filter((w) => (w.status === 'failed' || w.status === 'manual') && !awaiting(w.id));
  const refunds = db.bookings.filter((b) => b.status === 'cancelled' && b.paymentStatus === 'paid');
  const failedFood = db.foodOrders.filter((o) => o.payout?.status === 'failed' || o.refund?.status === 'failed');
  const foodDisputes = db.foodOrders.filter((o) => o.dispute && !o.dispute.resolved);
  const shopDisputes = db.shopDisputes.filter((d) => !d.ruling);
  const riders = byStatus(db.riders, 'pending');
  const vendors = byStatus(db.vendors, 'pending');

  const late = (c: Cand) => hoursSince(c.waitingSince) > PROMISE_H[c.verb];
  const canDo = (c: Cand) => (c.verb === 'review' ? can('verify', c.service) : can('move_money', c.service));

  // Next: what I am already on, else the most urgent thing I can act on that nobody else holds.
  const mine = cands.find((c) => c.yours);
  const next =
    mine ??
    [...cands]
      .filter((c) => canDo(c) && !c.claimedByOther)
      .sort((a, b) => a.rank - b.rank || Number(late(b)) - Number(late(a)) || a.waitingSince.localeCompare(b.waitingSince))[0];

  // Groups, by what the person will do.
  const row = (key: string, service: Service, title: string, detail: string, items: object[], amount: number | null, dates: string[], verb: keyof typeof PROMISE_H, link: string, canAct: boolean): HomeRow => {
    const oldestAt = oldestOf(dates);
    return { key, service, title, detail, amount, count: items.length, oldestAt, late: !!oldestAt && hoursSince(oldestAt) > PROMISE_H[verb], link, claimedBy: claimers(items as { claim?: Claim | null }[]), canAct };
  };
  const groups: HomeGroup[] = [];

  // The approval already shown as "next" is not listed again underneath it.
  const listedApprovals = approvals.filter((a) => !(next && next.link === '/approvals' && next.title.includes(naira(a.amount)) && next.why.startsWith(a.summary)));
  if (listedApprovals.length)
    groups.push({ verb: 'approve', label: 'Also waiting on your approval', summary: `${listedApprovals.length} · ${naira(sum(listedApprovals.map((a) => a.amount)))}`, rows: listedApprovals.map((a) => row(a.id, a.service, a.summary, `${a.requestedBy} asked: “${a.reason}”`, [], a.amount, [a.requestedAt], 'approve', '/approvals', true)) });

  const pay: HomeRow[] = [];
  if (covers('express') && stuck.length) {
    const hand = stuck.filter((w) => w.status === 'manual').length;
    pay.push(row('withdrawals', 'express', `${s(stuck.length, "rider couldn't", "riders couldn't")} withdraw`, `${s(stuck.length - hand, 'turned back by the bank', 'turned back by the bank')}${hand ? ` · ${hand} to pay by hand` : ''}`, stuck, sum(stuck.map((w) => w.amount)), stuck.map((w) => w.requestedAt), 'pay', '/express/withdrawals?status=stuck', can('move_money', 'express')));
  }
  if (covers('express') && refunds.length)
    pay.push(row('refunds', 'express', `${s(refunds.length, 'customer', 'customers')} paid for trips that never came`, 'Refund each one their fare', refunds, sum(refunds.map((b) => b.fare)), refunds.map((b) => b.createdAt), 'pay', '/express/bookings?status=to_refund', can('move_money', 'express')));
  if (covers('food') && failedFood.length) {
    const names = [...new Set(failedFood.map((o) => (o.refund?.status === 'failed' ? o.buyer.name : o.vendor.name)))];
    pay.push(row('food-money', 'food', `${s(failedFood.length, 'food payment', 'food payments')} didn't go through`, names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : ''), failedFood, sum(failedFood.map((o) => (o.refund?.status === 'failed' ? o.refund.amount : (o.payout?.amount ?? 0)))), failedFood.map((o) => o.createdAt), 'pay', '/food/orders?status=money_failed', can('move_money', 'food')));
  }
  if (pay.length) {
    const people = sum(pay.map((p) => p.count));
    groups.push({ verb: 'pay', label: 'People owed money', summary: `${s(people, 'person', 'people')} · ${naira(sum(pay.map((p) => p.amount ?? 0)))}`, rows: pay.sort((a, b) => Number(b.late) - Number(a.late) || (b.amount ?? 0) - (a.amount ?? 0)) });
  }

  const rule: HomeRow[] = [];
  if (covers('food') && foodDisputes.length)
    rule.push(row('food-disputes', 'food', `${s(foodDisputes.length, 'buyer is', 'buyers are')} waiting for a ruling`, 'DezenFoods orders they say went wrong', foodDisputes, sum(foodDisputes.map((o) => o.total)), foodDisputes.map((o) => o.dispute!.openedAt), 'rule', '/food/disputes', can('move_money', 'food')));
  if (covers('shopping') && shopDisputes.length)
    rule.push(row('shop-disputes', 'shopping', `${s(shopDisputes.length, 'buyer and seller disagree', 'buyers and sellers disagree')}`, 'Shopping orders · your ruling goes to an owner', shopDisputes, null, shopDisputes.map((d) => d.openedAt), 'rule', '/shopping/disputes', can('move_money', 'shopping')));
  if (rule.length) groups.push({ verb: 'rule', label: 'Needs a ruling', summary: s(sum(rule.map((x) => x.count)), 'dispute', 'disputes'), rows: rule });

  const review: HomeRow[] = [];
  if (covers('express') && riders.length) review.push(row('riders', 'express', `${s(riders.length, "rider can't", "riders can't")} earn until someone checks them`, 'Licence and plate number', riders, null, riders.map((x) => x.createdAt), 'review', '/express/riders?status=pending', can('verify', 'express')));
  if (covers('food') && vendors.length) review.push(row('vendors', 'food', `${s(vendors.length, 'kitchen is', 'kitchens are')} ready to sell`, 'Address and payout name', vendors, null, vendors.map((v) => v.createdAt), 'review', '/food/vendors?status=pending', can('verify', 'food')));
  const providers = byStatus(db.providers, 'pending');
  if (covers('express') && providers.length) review.push(row('providers', 'express', `${s(providers.length, 'delivery company wants', 'delivery companies want')} to deliver`, 'Coverage and contacts', providers, null, providers.map((p) => p.createdAt), 'review', '/express/providers?status=pending', can('verify', 'express')));
  const reported = db.products.filter((p) => p.reports > 0 && p.visible);
  if (covers('shopping') && reported.length) review.push(row('products', 'shopping', `${s(reported.length, 'product was', 'products were')} reported by buyers`, 'Hide or keep them', reported, null, reported.map((p) => p.createdAt), 'review', '/shopping/products?status=reported', can('verify', 'shopping')));
  if (review.length) groups.push({ verb: 'review', label: 'To review', summary: `${sum(review.map((x) => x.count))} waiting`, rows: review });

  // Today.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = db.settled.filter((x) => new Date(x.at) >= todayStart);
  const tally = (xs: typeof today) => ({ people: xs.length, amount: sum(xs.map((x) => x.amount ?? 0)) });
  const week = db.week.map((d, i) => (i === db.week.length - 1 ? { ...d, cleared: today.length } : d));

  // The living mark: what each service owes people, and whether any of it is late.
  const services = (['shopping', 'express', 'food', 'platform'] as Service[]).filter(covers).map((svc) => {
    const mineSvc = cands.filter((c) => c.service === svc);
    const owed = sum(mineSvc.filter((c) => c.verb === 'pay' || c.verb === 'approve').map((c) => c.amount ?? 0));
    return { service: svc, owed, people: mineSvc.length, late: mineSvc.some(late) };
  });

  return {
    latePeople: cands.filter(late).length,
    waitingPeople: cands.length,
    oldestAt: oldestOf(cands.map((c) => c.waitingSince)),
    next: next ? (({ verb, rank: _r, claimedByOther: _c, queue: _q, ...n }) => ({ ...n, promiseHours: PROMISE_H[verb] }))(next) : null,
    groups,
    today: { mine: tally(today.filter((x) => x.by === EMAIL)), team: tally(today), settled: today.slice(0, 6), week },
    services,
  };
};

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
      const day = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
      const before = (a: Approval) => {
        if (a.target.kind !== 'withdrawal') return undefined;
        const w = db.withdrawals.find((x) => x.id === a.target.id);
        if (!w || !w.lastError) return undefined;
        const fixed = w.bankDetailsUpdatedAt ? ` ${w.rider.name} changed their bank details on ${day(w.bankDetailsUpdatedAt)}.` : '';
        return `Tried ${w.attempts} times since ${day(w.requestedAt)}, to ${w.bank} ${w.accountNumberMasked}. The bank said: ${w.lastError}.${fixed}`;
      };
      const name = (email: string) => db.staff.find((x) => x.email === email)?.name ?? email;
      const rows = (params.status ? mine.filter((a) => a.status === params.status) : mine).map((a) => ({ ...a, before: before(a), requestedByName: name(a.requestedBy) }));
      return ok(page(rows, params));
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
  { method: 'GET', path: /^\/admin\/queue\/([a-z-]+)$/, handle: ({ match }) => ok(queueTop(match[1] as QueueKey)) },
  { method: 'GET', path: /^\/admin\/home$/, handle: () => ok(home()) },
  { method: 'GET', path: /^\/admin\/queues$/, handle: () => ok(queues()) },
  { method: 'GET', path: /^\/admin\/search$/, handle: (req) => ok(search(req.params.q ?? '')) },

  { method: 'GET', path: /^\/admin\/reviews\/(vendor|rider|provider)\/([^/]+)$/, handle: ({ match }) => ok(reviewCase(match[1] as ReviewKind, match[2])) },
  // DezenFoods
  {
    method: 'GET',
    path: /^\/admin\/food\/vendors$/,
    needs: ['support', 'food'],
    handle: ({ params }) => ok(page(oldestFirst(params.status, byStatus(db.vendors, params.status).filter((v) => matches(params.q, v.businessName, v.ownerName))), params)),
  },
  {
    method: 'POST',
    path: /^\/admin\/food\/vendors\/([^/]+)\/review$/,
    needs: ['verify', 'food'],
    log: (r) => `${String(r.body.status) === 'approved' ? 'Approved' : String(r.body.status) === 'rejected' ? 'Rejected' : 'Suspended'} vendor ${db.vendors.find((v) => v.id === r.match[1])?.businessName}`,
    handle: (req) => {
      const v = find(db.vendors, req.match[1], 'Vendor');
      const status = req.body.status as typeof v.status;
      if (status === 'approved' && v.status === 'pending') checksDone(req, 'vendor', v.id);
      if (status !== 'approved') v.rejectionReason = needReason(req);
      v.status = status;
      if (status === 'approved') db.settled.unshift({ text: `${v.businessName} can sell now`, by: EMAIL, at: now() });
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
    handle: ({ params }) => ok(page(db.foodOrders.filter((o) => o.dispute && !o.dispute.resolved).sort((a, b) => a.dispute!.openedAt.localeCompare(b.dispute!.openedAt)), params)),
  },
  {
    method: 'POST',
    path: /^\/admin\/food\/disputes\/([^/]+)\/resolve$/,
    needs: ['move_money', 'food'],
    code: true,
    log: (r) => `Ruled "${r.body.resolution === 'refund_buyer' ? 'refund buyer' : r.body.resolution === 'split' ? `split: ₦${Number(r.body.amount).toLocaleString('en-NG')} back to the buyer, ₦${Number(r.body.vendorAmount).toLocaleString('en-NG')} to the vendor` : 'pay vendor'}" on ${db.foodOrders.find((o) => o.id === r.match[1])?.orderRef}`,
    handle: (req) => {
      const o = find(db.foodOrders, req.match[1], 'Order');
      if (!o.dispute || o.dispute.resolved) throw new Fail(409, 'This dispute is already settled');
      guardClaim(o);
      needReason(req);
      if (req.body.resolution === 'split') {
        // The food price is shared: part back to the buyer, the rest to the vendor. Fees are kept.
        const back = Number(req.body.amount);
        const toVendor = Number(req.body.vendorAmount);
        if (!(back > 0 && toVendor > 0) || back + toVendor !== o.subtotal) throw new Fail(422, `The two parts must add up to the food price, ₦${o.subtotal.toLocaleString('en-NG')}`);
        return gate(req, { service: 'food', summary: `Split ${o.orderRef}: ₦${back.toLocaleString('en-NG')} back to ${o.buyer.name}, ₦${toVendor.toLocaleString('en-NG')} to ${o.vendor.name}`, amount: back, recipient: o.buyer.name, link: `/food/orders/${o.id}`, target: { kind: 'food-order', id: o.id } }, () => {
          o.dispute!.resolved = true;
          o.status = 'completed';
          o.refund = { status: 'processing', amount: back, attempts: 1 };
          o.payout = { status: 'processing', amount: toVendor, attempts: 1 };
          addNote(o.id, `Ruled: split. ₦${back.toLocaleString('en-NG')} back to ${o.buyer.name}, ₦${toVendor.toLocaleString('en-NG')} to ${o.vendor.name}`);
          const next = db.foodOrders.find((x) => x.id !== o.id && x.dispute && !x.dispute.resolved);
          return receipt(back, `${o.buyer.name} · and ₦${toVendor.toLocaleString('en-NG')} to ${o.vendor.name}`, 'sent', next && { label: `Next dispute: ${next.orderRef}`, link: `/food/orders/${next.id}` });
        });
      }
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
    handle: ({ params }) => ok(page(oldestFirst(params.status, byStatus(db.riders, params.status).filter((r) => matches(params.q, r.name, r.plateNumber))), params)),
  },
  {
    method: 'PATCH',
    path: /^\/admin\/express\/riders\/([^/]+)\/verify$/,
    needs: ['verify', 'express'],
    log: (r) => `${r.body.status === 'verified' ? 'Approved' : 'Rejected'} rider ${db.riders.find((x) => x.id === r.match[1])?.name}`,
    handle: (req) => {
      const r = find(db.riders, req.match[1], 'Rider');
      if (req.body.status === 'verified') checksDone(req, 'rider', r.id);
      if (req.body.status === 'rejected') (r as { rejectionReason?: string }).rejectionReason = needReason(req);
      r.status = req.body.status as typeof r.status;
      if (r.status === 'verified') db.settled.unshift({ text: `${r.name} can drive now`, by: EMAIL, at: now() });
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
      const step = (w: Withdrawal): Withdrawal['nextStep'] =>
        pending(w.id) ? 'awaiting_approval'
        : w.status === 'manual' ? 'pay_by_hand'
        : w.status !== 'failed' ? undefined
        : /name does not match|invalid account|account not found/i.test(w.lastError ?? '') && !w.bankDetailsUpdatedAt ? (w.riderAskedAt ? 'rider_asked' : 'rider_fixes_bank')
        : /insufficient balance/i.test(w.lastError ?? '') ? 'top_up_wallet'
        : 'send_again';
      const ORDER = ['send_again', 'pay_by_hand', 'rider_fixes_bank', 'top_up_wallet', 'rider_asked', 'awaiting_approval'];
      const rows = xs
        .filter((w) => matches(params.q, w.rider.name))
        .map((w) => ({ ...w, awaitingApproval: pending(w.id), nextStep: step(w), lastAttemptAt: w.lastAttemptAt ?? (w.status === 'failed' ? new Date(new Date(w.requestedAt).getTime() + 3_600_000).toISOString() : undefined) }))
        .sort((a, b) => (params.status === 'stuck' ? ORDER.indexOf(a.nextStep ?? '') - ORDER.indexOf(b.nextStep ?? '') : 0) || a.requestedAt.localeCompare(b.requestedAt));
      return ok(page(rows, params));
    },
  },
  {
    method: 'POST',
    path: /^\/admin\/express\/withdrawals\/([^/]+)\/ask-rider$/,
    needs: ['support', 'express'],
    log: (r) => `Asked ${db.withdrawals.find((w) => w.id === r.match[1])?.rider.name} to fix their bank details`,
    handle: (req) => {
      const w = find(db.withdrawals, req.match[1], 'Withdrawal');
      w.riderAskedAt = now();
      return ok({ asked: true });
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
      if (/name does not match|invalid account|account not found/i.test(w.lastError ?? '') && !w.bankDetailsUpdatedAt) throw new Fail(409, 'The bank will refuse this again: the rider must fix their bank details first');
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
    handle: ({ params }) => ok(page(oldestFirst(params.status, byStatus(db.providers, params.status)), params)),
  },
  {
    method: 'PATCH',
    path: /^\/admin\/express\/providers\/([^/]+)\/verify$/,
    needs: ['verify', 'express'],
    log: (r) => `${r.body.status === 'verified' ? 'Approved' : 'Rejected'} delivery company ${db.providers.find((p) => p.id === r.match[1])?.name}`,
    handle: (req) => {
      const p = find(db.providers, req.match[1], 'Delivery company');
      if (req.body.status === 'verified') checksDone(req, 'provider', p.id);
      if (req.body.status === 'rejected') (p as { rejectionReason?: string }).rejectionReason = needReason(req);
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
        [`${o.buyer.name} paid ₦${o.amountNgn.toLocaleString('en-NG')} (${o.amount} ${o.currency}); held until delivery is confirmed`, 'payment'],
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
    // Open ones first, oldest at the top; rulings waiting on an owner after them.
    handle: ({ params }) => ok(page([...db.shopDisputes].sort((a, b) => Number(!!a.ruling) - Number(!!b.ruling) || a.openedAt.localeCompare(b.openedAt)), params)),
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
      return ok(receipt(d.order.amount, `${who}, once an owner carries it out`, 'recorded', undefined, d.order.currency, d.order.amountNgn));
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
        ...db.shopOrders.filter((o) => o.buyer.id === p.id).map((o) => ({ service: 'shopping' as const, kind: 'order' as const, ref: o.orderRef, status: o.status, amount: o.amountNgn, currency: 'NGN', at: o.createdAt, link: `/shopping/orders/${o.id}` })),
      ].sort((a, b) => b.at.localeCompare(a.at));
      const refs = new Set(activity.map((a) => a.ref));
      const owedToThem = [
        ...db.bookings.filter((b) => b.customer.id === p.id && b.status === 'cancelled' && b.paymentStatus === 'paid').map((b) => ({ text: `Trip refund for ${b.bookingRef}`, amount: b.fare, since: b.createdAt, link: `/express/bookings/${b.id}` })),
        ...db.foodOrders.filter((o) => o.buyer.id === p.id && o.refund?.status === 'failed').map((o) => ({ text: `Food refund for ${o.orderRef} didn't go through`, amount: o.refund!.amount, since: o.createdAt, link: `/food/orders/${o.id}` })),
      ];
      const openCases = [
        ...db.foodOrders.filter((o) => o.buyer.id === p.id && o.dispute && !o.dispute.resolved).map((o) => ({ text: `Dispute on ${o.orderRef}: “${o.dispute!.reason}”`, since: o.dispute!.openedAt, link: `/food/orders/${o.id}` })),
        ...db.shopDisputes.filter((d) => d.order.buyer.id === p.id && !d.ruling).map((d) => ({ text: `Dispute on ${d.order.orderRef}: “${d.reason}”`, since: d.openedAt, link: '/shopping/disputes' })),
      ];
      const ninety = Date.now() - 90 * 24 * HOUR;
      const disputes90d =
        db.foodOrders.filter((o) => o.buyer.id === p.id && o.dispute && new Date(o.dispute.openedAt).getTime() > ninety).length +
        db.shopDisputes.filter((d) => d.order.buyer.id === p.id && new Date(d.openedAt).getTime() > ninety).length;
      return ok({ ...summary, activity, payments: db.payments.filter((x) => [...refs].some((r) => x.purpose.includes(r))), standing: { owedToThem, openCases, disputes90d, orders: activity.length } });
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
      if (match[2] === 'disable' && s.capabilities.includes('staff_admin')) throw new Fail(409, 'An owner cannot be removed here');
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
    handle: ({ params }) => {
      const name = (email: string) => db.staff.find((x) => x.email === email)?.name ?? email.split('@')[0];
      const rows = db.audit.map((a) => ({ ...a, staffName: name(a.staffEmail) }));
      return ok(page(rows.filter((a) => (!params.service || a.service === params.service) && matches(params.q, a.staffEmail, a.staffName, a.summary)), params, 25));
    },
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

  lapseClaims();
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
