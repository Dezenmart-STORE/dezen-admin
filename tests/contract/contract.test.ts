import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { sampleBaseQuery } from '../../src/mocks/backend';
import * as S from './schemas';

/**
 * The contract between the admin and the backend.
 *
 * By default these run against the sample backend (src/mocks/backend.ts), so the sample data can
 * never drift from what the screens expect. Point them at the real backend to check it:
 *
 *   CONTRACT_API_URL=https://api.example.com/api/v1 CONTRACT_TOKEN=<staff session token> npm run test:contract
 *
 * Against the real backend only the read-only checks run; nothing is changed there.
 */
const LIVE = process.env.CONTRACT_API_URL?.replace(/\/$/, '');
const TOKEN = process.env.CONTRACT_TOKEN;
const CODE = { 'X-Admin-Code': '271828' };

type Result = { status: number; body: unknown };

async function call(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Result> {
  if (LIVE) {
    const res = await fetch(`${LIVE}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  const r = (await sampleBaseQuery({ url, method, body, headers })) as { data?: unknown; error?: { status: number; data: unknown } };
  return r.error ? { status: r.error.status, body: r.error.data } : { status: 200, body: r.data };
}

/** GET, check the envelope and the shape, and hand back the data. */
async function read<T extends z.ZodTypeAny>(url: string, schema: T): Promise<z.infer<T>> {
  const r = await call('GET', url);
  expect(r.status, `${url} answered ${r.status}`).toBe(200);
  const parsed = S.envelope(schema).safeParse(r.body);
  if (!parsed.success) throw new Error(`${url} does not match the contract:\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  return parsed.data.data;
}
const firstId = async (url: string, schema: z.ZodTypeAny) => {
  const p = (await read(url, S.page(schema))) as { items: { id: string }[] };
  return p.items[0]?.id;
};
const writes = LIVE ? it.skip : it;

describe('reads: every screen gets the shape it expects', { timeout: 30_000 }, () => {
  it('who is signed in', () => read('/admin/auth/me', S.me));
  it('Home', () => read('/admin/home', S.home));
  it('menu counts', () => read('/admin/queues', S.queues));
  for (const key of ['approvals', 'withdrawals', 'refunds', 'food-money', 'food-disputes', 'shop-disputes', 'riders', 'vendors', 'providers', 'products'])
    it(`queue top: ${key}`, () => read(`/admin/queue/${key}`, S.queueTop));
  it('search', () => read('/admin/search?q=ada', S.searchResults));
  it('approvals', () => read('/admin/approvals?status=pending', S.page(S.approval)));

  it('vendors, and a vendor as a review case', async () => {
    const id = await firstId('/admin/food/vendors?status=pending', S.vendor);
    if (id) await read(`/admin/reviews/vendor/${id}`, S.reviewCase);
  });
  it('riders, and a rider as a review case', async () => {
    const id = await firstId('/admin/express/riders?status=pending', S.rider);
    if (id) await read(`/admin/reviews/rider/${id}`, S.reviewCase);
  });
  it('delivery companies, and one as a review case', async () => {
    const id = await firstId('/admin/express/providers?status=pending', S.provider);
    if (id) await read(`/admin/reviews/provider/${id}`, S.reviewCase);
  });
  it('food orders and one order', async () => {
    const id = await firstId('/admin/food/orders', S.foodOrder);
    if (id) await read(`/admin/food/orders/${id}`, S.foodOrderDetail);
  });
  it('food disputes, oldest first', async () => {
    const p = await read('/admin/food/disputes', S.page(S.foodOrder));
    const opened = p.items.map((o) => o.dispute!.openedAt);
    expect(opened).toEqual([...opened].sort());
  });
  it('trips and one trip', async () => {
    const id = await firstId('/admin/express/bookings', S.booking);
    if (id) await read(`/admin/express/bookings/${id}`, S.bookingDetail);
  });
  it('withdrawals that need someone each say what unsticks them', async () => {
    const p = await read('/admin/express/withdrawals?status=stuck', S.page(S.withdrawal));
    for (const w of p.items) expect(w.nextStep, `${w.id} has no nextStep`).toBeDefined();
  });
  it('Shopping orders are in naira and one order', async () => {
    const id = await firstId('/admin/shopping/orders', S.shopOrder);
    if (id) await read(`/admin/shopping/orders/${id}`, S.shopOrderDetail);
  });
  it('Shopping disputes', () => read('/admin/shopping/disputes', S.page(S.shopDispute)));
  it('reported products are all still on sale', async () => {
    const p = await read('/admin/shopping/products?status=reported', S.page(S.product));
    for (const x of p.items) expect(x.visible && x.reports > 0).toBe(true);
  });
  it('sellers', () => read('/admin/shopping/sellers', S.page(S.seller)));
  it('people and one person with where they stand', async () => {
    const id = await firstId('/admin/platform/users', S.person);
    if (id) await read(`/admin/platform/users/${id}`, S.personDetail);
  });
  it('payments', () => read('/admin/platform/payments', S.page(S.payment)));
  it('payment notices', () => read('/admin/platform/webhooks?status=problems', S.page(S.webhook)));
  it('daily balance check', () => read('/admin/platform/reconciliation', S.reconciliation));
  it('fees and fares', () => read('/admin/platform/settings', S.settings));
  it('staff', () => read('/admin/staff', S.staffOverview));
  it('activity log', () => read('/admin/audit', S.page(S.audit)));
});

describe('rules the backend must keep (sample backend only)', { timeout: 30_000 }, () => {
  writes('approving a rider without every check is refused', async () => {
    const id = await firstId('/admin/express/riders?status=pending', S.rider);
    const r = await call('PATCH', `/admin/express/riders/${id}/verify`, { status: 'verified', checks: [] });
    expect(r.status).toBe(422);
  });

  writes('approving a rider with every check ticked works', async () => {
    const id = await firstId('/admin/express/riders?status=pending', S.rider);
    const c = await read(`/admin/reviews/rider/${id}`, S.reviewCase);
    const r = await call('PATCH', `/admin/express/riders/${id}/verify`, { status: 'verified', checks: c.checks.map((k) => k.id) });
    expect(r.status).toBe(200);
  });

  writes('sending again is refused while the rider has not fixed a wrong account name', async () => {
    const p = await read('/admin/express/withdrawals?status=stuck', S.page(S.withdrawal));
    const w = p.items.find((x) => x.nextStep === 'rider_fixes_bank' || x.nextStep === 'rider_asked');
    if (!w) return;
    const r = await call('POST', `/admin/express/withdrawals/${w.id}/retry`, { amount: w.amount }, CODE);
    expect(r.status).toBe(409);
  });

  writes('an owner cannot be removed', async () => {
    const s = await read('/admin/staff', S.staffOverview);
    const owner = s.staff.find((x) => x.capabilities.includes('staff_admin') && !x.email.startsWith('you@'));
    if (!owner) return;
    const r = await call('POST', `/admin/staff/${owner.id}/disable`, { reason: 'test' }, CODE);
    expect(r.status).toBe(409);
  });

  writes('a split ruling must add up to the food price', async () => {
    const p = await read('/admin/food/disputes', S.page(S.foodOrder));
    // One nobody else is holding: a claimed record refuses everyone else's money actions (409).
    const o = p.items.find((x) => !x.claim);
    if (!o) return;
    const bad = await call('POST', `/admin/food/disputes/${o.id}/resolve`, { resolution: 'split', amount: 1, vendorAmount: 1, note: 'test split' }, CODE);
    expect(bad.status).toBe(422);
    const half = Math.round(o.subtotal / 2);
    const good = await call('POST', `/admin/food/disputes/${o.id}/resolve`, { resolution: 'split', amount: half, vendorAmount: o.subtotal - half, note: 'test split' }, CODE);
    expect(good.status).toBe(200);
    const parsed = S.envelope(S.receipt).safeParse(good.body);
    expect(parsed.success).toBe(true);
  });

  writes('every money action is in the activity log', async () => {
    const before = (await read('/admin/audit', S.page(S.audit))).total;
    const p = await read('/admin/express/withdrawals?status=stuck', S.page(S.withdrawal));
    const w = p.items.find((x) => x.nextStep === 'pay_by_hand' && !x.claim);
    if (!w) return;
    const r = await call('POST', `/admin/express/withdrawals/${w.id}/mark-paid`, { transferReference: 'TEST-1234', reason: 'test', amount: w.amount }, CODE);
    expect(r.status).toBe(200);
    expect((await read('/admin/audit', S.page(S.audit))).total).toBe(before + 1);
  });
});
