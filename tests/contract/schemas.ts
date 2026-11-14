import { z } from 'zod';

/**
 * What the admin needs each endpoint to return, as runtime checks. They mirror src/store/types.ts
 * and only insist on the fields the screens read; extra fields are fine.
 */

const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'an ISO date');
const service = z.enum(['food', 'express', 'shopping', 'platform']);
const capability = z.enum(['support', 'verify', 'read_pii', 'move_money', 'chain_ops', 'staff_admin']);
const ref = z.object({ id: z.string(), name: z.string() });
const claim = z.object({ by: z.string(), name: z.string(), since: iso, activeAt: iso.optional() }).nullable().optional();
const timeline = z.array(z.object({ at: iso, kind: z.enum(['status', 'payment', 'staff', 'message']), text: z.string(), actor: z.string().optional() }));

export const envelope = <T extends z.ZodTypeAny>(data: T) => z.object({ status: z.literal('success'), data });
export const page = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), total: z.number().int().nonnegative(), page: z.number().int().positive(), limit: z.number().int().positive() });

export const me = z.object({ email: z.string(), capabilities: z.array(capability), services: z.array(z.union([service, z.literal('*')])) });

const homeNext = z.object({
  kind: z.string(),
  service,
  title: z.string(),
  why: z.string(),
  amount: z.number().optional(),
  waitingSince: iso,
  link: z.string().startsWith('/'),
  promiseHours: z.number().positive().optional(),
  claim: z.object({ kind: z.enum(['food-order', 'booking', 'withdrawal', 'shop-dispute']), id: z.string() }).optional(),
  yours: z.boolean().optional(),
});

export const home = z.object({
  latePeople: z.number().int().nonnegative(),
  waitingPeople: z.number().int().nonnegative(),
  oldestAt: iso.optional(),
  next: homeNext.nullable(),
  groups: z.array(
    z.object({
      verb: z.enum(['approve', 'pay', 'rule', 'review']),
      label: z.string(),
      summary: z.string(),
      rows: z.array(
        z.object({
          key: z.string(),
          service,
          title: z.string(),
          detail: z.string(),
          amount: z.number().nullable().optional(),
          count: z.number().int(),
          oldestAt: iso.optional(),
          late: z.boolean(),
          link: z.string(),
          claimedBy: z.array(z.object({ name: z.string(), count: z.number().int() })),
          canAct: z.boolean(),
        }),
      ),
    }),
  ),
  today: z.object({
    mine: z.object({ people: z.number(), amount: z.number() }),
    team: z.object({ people: z.number(), amount: z.number() }),
    settled: z.array(z.object({ service: service.optional(), text: z.string(), amount: z.number().optional(), by: z.string(), at: iso, link: z.string().optional() })),
    week: z.array(z.object({ day: z.string(), cleared: z.number(), added: z.number() })).length(7),
  }),
  services: z.array(z.object({ service, owed: z.number(), people: z.number(), late: z.boolean() })),
});

export const queueTop = z.object({
  key: z.string(),
  promiseHours: z.number().positive(),
  waitingPeople: z.number().int().nonnegative(),
  latePeople: z.number().int().nonnegative(),
  oldestAt: iso.optional(),
  claimedBy: z.array(z.object({ name: z.string(), count: z.number().int() })),
  canAct: z.boolean(),
  next: homeNext.nullable(),
});

export const queues = z.array(z.object({ key: z.string(), service, label: z.string(), count: z.number().int(), link: z.string(), amountAtStake: z.number().nullable().optional() }));

export const searchResults = z.array(
  z.object({
    kind: z.enum(['person', 'order', 'booking', 'payment', 'vendor', 'rider']),
    service,
    id: z.string(),
    title: z.string(),
    subtitle: z.string(),
    link: z.string().startsWith('/'),
    status: z.string().optional(),
    amount: z.number().optional(),
  }),
);

export const approval = z.object({
  id: z.string(),
  service,
  summary: z.string(),
  amount: z.number(),
  currency: z.string(),
  amountNgn: z.number().optional(),
  recipient: z.string(),
  reason: z.string(),
  before: z.string().optional(),
  requestedByName: z.string().optional(),
  requestedBy: z.string(),
  requestedAt: iso,
  link: z.string(),
  target: z.object({ kind: z.string(), id: z.string() }),
  status: z.enum(['pending', 'approved', 'declined']),
});

export const reviewCase = z.object({
  kind: z.enum(['vendor', 'rider', 'provider']),
  id: z.string(),
  service,
  name: z.string(),
  summary: z.string(),
  status: z.enum(['pending', 'approved', 'verified', 'rejected', 'suspended']),
  appliedAt: iso,
  facts: z.array(z.object({ label: z.string(), value: z.string() })),
  documents: z.array(z.object({ id: z.string(), label: z.string(), caption: z.string().optional(), url: z.string().url().optional() })).min(1),
  checks: z.array(z.object({ id: z.string(), label: z.string(), expected: z.string().optional() })).min(1),
  rejectionReason: z.string().optional(),
});

export const vendor = z.object({
  id: z.string(),
  businessName: z.string(),
  ownerName: z.string(),
  address: z.string(),
  lga: z.string(),
  state: z.string(),
  status: z.enum(['pending', 'approved', 'rejected', 'suspended']),
  payoutAccount: z.object({ bankName: z.string(), accountName: z.string(), accountNumberMasked: z.string() }),
  ordersCompleted: z.number(),
  createdAt: iso,
});

const money = z.object({ status: z.enum(['pending', 'processing', 'paid', 'failed']), amount: z.number(), attempts: z.number(), lastError: z.string().optional() });
export const foodOrder = z.object({
  claim,
  id: z.string(),
  orderRef: z.string(),
  status: z.string(),
  vendor: ref,
  buyer: ref,
  items: z.array(z.object({ name: z.string(), quantity: z.number().int().positive(), price: z.number() })),
  subtotal: z.number(),
  deliveryFee: z.number(),
  serviceFee: z.number(),
  total: z.number(),
  fulfilment: z.enum(['delivery', 'pickup']),
  payout: money.optional(),
  refund: money.optional(),
  dispute: z.object({ reason: z.string(), openedAt: iso, resolved: z.boolean() }).optional(),
  createdAt: iso,
});
export const foodOrderDetail = foodOrder.extend({ timeline });

export const rider = z.object({
  id: z.string(),
  name: z.string(),
  vehicleType: z.string(),
  plateNumber: z.string(),
  licenceNumber: z.string(),
  status: z.enum(['pending', 'verified', 'rejected']),
  walletBalance: z.number(),
  tripsCompleted: z.number(),
  createdAt: iso,
});

export const booking = z.object({
  claim,
  id: z.string(),
  bookingRef: z.string(),
  type: z.enum(['ride', 'delivery']),
  status: z.string(),
  paymentStatus: z.enum(['unpaid', 'paid', 'refunded', 'refund_pending', 'refund_failed']),
  customer: ref,
  pickup: z.string(),
  dropoff: z.string(),
  fare: z.number(),
  createdAt: iso,
});
export const bookingDetail = booking.extend({ timeline });

export const withdrawal = z.object({
  claim,
  awaitingApproval: z.boolean().optional(),
  id: z.string(),
  rider: ref,
  amount: z.number(),
  status: z.enum(['pending', 'processing', 'paid', 'failed', 'manual']),
  attempts: z.number(),
  lastError: z.string().optional(),
  lastAttemptAt: iso.optional(),
  nextStep: z.enum(['send_again', 'rider_fixes_bank', 'top_up_wallet', 'pay_by_hand', 'awaiting_approval', 'rider_asked']).optional(),
  bank: z.string(),
  accountNumberMasked: z.string(),
  requestedAt: iso,
});

export const provider = z.object({ id: z.string(), name: z.string(), status: z.enum(['pending', 'verified', 'rejected']), coverage: z.array(z.string()), deliveriesCompleted: z.number(), createdAt: iso });

export const shopOrder = z.object({
  id: z.string(),
  orderRef: z.string(),
  status: z.string(),
  product: ref,
  buyer: ref,
  seller: ref,
  amount: z.number(),
  currency: z.string(),
  amountNgn: z.number().positive(),
  quantity: z.number().int().positive(),
  held: z.boolean(),
  createdAt: iso,
});
export const shopOrderDetail = shopOrder.extend({ timeline });
export const shopDispute = z.object({ claim, id: z.string(), order: shopOrder, reason: z.string(), openedBy: z.enum(['buyer', 'seller']), openedAt: iso });

export const product = z.object({
  id: z.string(),
  name: z.string(),
  seller: ref,
  price: z.number(),
  currency: z.string(),
  priceNgn: z.number().positive(),
  stock: z.number(),
  category: z.string(),
  visible: z.boolean(),
  reports: z.number().int().nonnegative(),
  reportNotes: z.array(z.object({ text: z.string(), at: iso })).optional(),
  sponsored: z.boolean(),
  createdAt: iso,
});
export const seller = z.object({ id: z.string(), name: z.string(), products: z.number(), ordersCompleted: z.number(), disputes: z.number(), joinedAt: iso });

export const person = z.object({ id: z.string(), name: z.string(), emailMasked: z.string(), isSeller: z.boolean(), isVendor: z.boolean(), isRider: z.boolean(), joinedAt: iso });
const payment = z.object({ id: z.string(), service, reference: z.string(), direction: z.enum(['in', 'out']), purpose: z.string(), amount: z.number(), status: z.enum(['pending', 'success', 'failed', 'reversed']), at: iso });
export const personDetail = person.extend({
  activity: z.array(z.object({ service, kind: z.enum(['order', 'booking']), ref: z.string(), status: z.string(), amount: z.number(), currency: z.string(), at: iso, link: z.string() })),
  payments: z.array(payment),
  standing: z.object({
    owedToThem: z.array(z.object({ text: z.string(), amount: z.number(), since: iso, link: z.string() })),
    openCases: z.array(z.object({ text: z.string(), since: iso, link: z.string() })),
    disputes90d: z.number().int(),
    orders: z.number().int(),
  }),
});
export { payment };
export const webhook = z.object({ id: z.string(), provider: z.string(), event: z.string(), reference: z.string().optional(), signatureOk: z.boolean(), handled: z.boolean(), receivedAt: iso });
export const reconciliation = z.array(z.object({ id: z.string(), ranAt: iso, ok: z.boolean(), checks: z.array(z.object({ name: z.string(), ours: z.number(), theirs: z.number(), difference: z.number() })) }));
export const settings = z.object({
  approvalThreshold: z.number().positive(),
  foodCommissionPercent: z.number().min(0).max(100),
  foodServiceFeePercent: z.number().min(0).max(100),
  expressPlatformFeePercent: z.number().min(0).max(100),
  expressFare: z.object({ baseFare: z.number(), perKm: z.number(), minFare: z.number(), premiumMultiplier: z.number(), mediumParcelSurcharge: z.number(), largeParcelSurcharge: z.number() }),
  updatedAt: iso,
  updatedBy: z.string(),
});
export const staffOverview = z.object({
  staff: z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), capabilities: z.array(capability), services: z.array(z.union([service, z.literal('*')])), authenticatorSet: z.boolean(), disabled: z.boolean(), createdAt: iso })),
  presets: z.record(z.array(capability)),
});
export const audit = z.object({ id: z.string(), staffEmail: z.string(), staffName: z.string().optional(), summary: z.string(), action: z.string(), reason: z.string().optional(), outcome: z.enum(['done', 'refused', 'failed']), requestId: z.string(), at: iso });

export const receipt = z.object({
  reference: z.string(),
  amount: z.number(),
  currency: z.string(),
  amountNgn: z.number().optional(),
  recipient: z.string(),
  state: z.enum(['sent', 'recorded', 'awaiting_approval']),
  at: iso,
  by: z.string(),
  next: z.object({ label: z.string(), link: z.string() }).optional(),
});
