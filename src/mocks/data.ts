import type {
  AuditEvent,
  Booking,
  DeliveryProvider,
  FoodOrder,
  Payment,
  PersonSummary,
  Product,
  ReconciliationRun,
  Rider,
  Seller,
  Settings,
  ShopDispute,
  ShopOrder,
  StaffMember,
  TimelineEntry,
  Vendor,
  WebhookEvent,
  Withdrawal,
} from '../store/types';

/** Sample data for reviewing the admin without a backend. Deterministic, so screens are stable. */

let seed = 7;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const int = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const id = (prefix: string, n: number) => `${prefix}${String(n).padStart(4, '0')}`;

const FIRST = ['Ada', 'Bola', 'Chidi', 'Dayo', 'Emeka', 'Funmi', 'Gbenga', 'Halima', 'Ifeoma', 'Jide', 'Kemi', 'Lanre', 'Musa', 'Ngozi', 'Ola', 'Sade', 'Tunde', 'Uche', 'Yemi', 'Zainab'];
const LAST = ['Adeyemi', 'Okafor', 'Bello', 'Eze', 'Ogunleye', 'Ibrahim', 'Nwosu', 'Balogun', 'Okonkwo', 'Abubakar', 'Afolabi', 'Chukwu'];
const BANKS = ['GTBank', 'Access Bank', 'Zenith Bank', 'First Bank', 'UBA', 'Opay', 'Kuda', 'Moniepoint'];
const AREAS: [string, string][] = [['Ikeja', 'Lagos'], ['Yaba', 'Lagos'], ['Lekki', 'Lagos'], ['Surulere', 'Lagos'], ['Wuse', 'FCT'], ['Garki', 'FCT'], ['Bodija', 'Oyo']];

const name = () => `${pick(FIRST)} ${pick(LAST)}`;
const masked = (n: string) => `******${n.slice(-4)}`;
const emailOf = (full: string, n: number) => `${full.toLowerCase().replace(' ', '.')}${n}@gmail.com`;
const maskEmail = (e: string) => `${e[0]}***${e.slice(e.indexOf('@') - 1)}`;

// ── people ───────────────────────────────────────────────────────────────────

export interface SamplePerson extends PersonSummary {
  email: string;
  phone: string;
  address: string;
  bankName: string;
  accountNumber: string;
}

export const people: SamplePerson[] = Array.from({ length: 48 }, (_, i) => {
  const full = name();
  const email = emailOf(full, i + 1);
  const phone = `+23480${String(int(10_000_000, 99_999_999))}`;
  const [lga, state] = pick(AREAS);
  return {
    id: id('u', i + 1),
    name: full,
    email,
    emailMasked: maskEmail(email),
    phone,
    phoneMasked: `${phone.slice(0, 7)}****${phone.slice(-2)}`,
    address: `${int(2, 80)} ${pick(['Allen Ave', 'Admiralty Way', 'Herbert Macaulay Way', 'Aminu Kano Cres', 'Ring Road'])}, ${lga}, ${state}`,
    bankName: pick(BANKS),
    accountNumber: String(int(1_000_000_000, 9_999_999_999)),
    isSeller: i % 6 === 0,
    isVendor: i % 8 === 1,
    isRider: false,
    joinedAt: ago(int(24, 24 * 300)),
  };
});
const person = () => pick(people);

// ── DezenFoods ───────────────────────────────────────────────────────────────

const KITCHENS = ['Mama Put Kitchen', 'Suya Spot', 'Jollof Hub', 'Amala Joint', 'Pepper Soup Place', 'Chop Life Grill', 'Iya Basira', 'Bole Corner', 'Ofada Express', 'Small Chops Co'];

export const vendors: Vendor[] = KITCHENS.map((businessName, i) => {
  const owner = people[i * 3];
  const [lga, state] = pick(AREAS);
  return {
    id: id('v', i + 1),
    businessName,
    ownerName: owner.name,
    ownerEmail: owner.emailMasked,
    phone: owner.phoneMasked ?? '',
    address: owner.address,
    lga,
    state,
    categories: [pick(['Nigerian', 'Grills', 'Soups', 'Snacks', 'Rice dishes'])],
    status: i < 4 ? 'pending' : i === 9 ? 'suspended' : i === 8 ? 'rejected' : 'approved',
    rejectionReason: i === 8 ? 'Kitchen photos did not match the address' : i === 9 ? 'Repeated late orders' : undefined,
    payoutAccount: { bankName: owner.bankName, accountName: owner.name.toUpperCase(), accountNumberMasked: masked(owner.accountNumber) },
    ordersCompleted: i < 4 ? 0 : int(12, 400),
    createdAt: ago(i < 4 ? int(2, 70) : int(200, 3000)),
  };
});

const DISHES: [string, number][] = [['Jollof rice and chicken', 3500], ['Pounded yam and egusi', 4200], ['Suya (large)', 3000], ['Amala and ewedu', 2500], ['Small chops pack', 5000], ['Fried rice and turkey', 4800], ['Pepper soup', 3200]];

export const foodOrders: FoodOrder[] = Array.from({ length: 36 }, (_, i) => {
  const vendor = vendors[4 + (i % 4)];
  const buyer = person();
  const items = Array.from({ length: int(1, 3) }, () => {
    const [dish, price] = pick(DISHES);
    return { name: dish, quantity: int(1, 3), price };
  });
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const deliveryFee = i % 3 === 0 ? 0 : pick([800, 1200, 1500]);
  const serviceFee = Math.ceil(subtotal * 0.05);
  const total = subtotal + deliveryFee + serviceFee;
  const status = i < 3 ? 'disputed' : i < 6 ? 'completed' : pick(['pending', 'accepted', 'preparing', 'ready', 'delivered', 'completed', 'cancelled']);
  return {
    id: id('fo', i + 1),
    orderRef: `FD-${1040 + i}`,
    status,
    vendor: { id: vendor.id, name: vendor.businessName },
    buyer: { id: buyer.id, name: buyer.name },
    items,
    subtotal,
    deliveryFee,
    serviceFee,
    total,
    fulfilment: deliveryFee ? 'delivery' : 'pickup',
    payout:
      status === 'completed'
        ? i === 4 || i === 5
          ? { status: 'failed', amount: subtotal, attempts: 5, lastError: 'The bank did not accept the transfer (account restricted)' }
          : { status: 'paid', amount: subtotal, attempts: 1 }
        : undefined,
    refund: status === 'cancelled' ? (i % 2 ? { status: 'failed', amount: total, attempts: 5, lastError: 'Provider timeout' } : { status: 'paid', amount: total, attempts: 1 }) : undefined,
    dispute:
      status === 'disputed'
        ? { reason: pick(['Food arrived cold and half the order was missing', 'Order never arrived', 'Wrong meal delivered']), openedAt: ago(int(3, 40)), resolved: false }
        : undefined,
    createdAt: ago(int(1, 200)),
  };
});

// ── DezenExpress ─────────────────────────────────────────────────────────────

export const riders: Rider[] = Array.from({ length: 22 }, (_, i) => {
  const full = name();
  const phone = `+23470${String(int(10_000_000, 99_999_999))}`;
  const status = i < 5 ? 'pending' : i === 21 ? 'rejected' : 'verified';
  return {
    id: id('r', i + 1),
    name: full,
    email: maskEmail(emailOf(full, 100 + i)),
    phone: `${phone.slice(0, 7)}****${phone.slice(-2)}`,
    vehicleType: pick(['Motorbike', 'Car', 'Tricycle']),
    plateNumber: `${pick(['LAG', 'ABJ', 'KJA', 'EKY'])}-${int(100, 999)}${pick(['AA', 'KD', 'XY'])}`,
    licenceNumber: `${pick(['LAG', 'FCT'])}${int(10_000_000, 99_999_999)}`,
    status,
    online: status === 'verified' && rand() > 0.5,
    walletBalance: status === 'verified' ? int(0, 90) * 500 : 0,
    tripsCompleted: status === 'verified' ? int(5, 600) : 0,
    payoutAccount: status === 'verified' && i % 4 ? { bankName: pick(BANKS), accountName: full.toUpperCase(), accountNumberMasked: masked(String(int(1e9, 9e9))) } : undefined,
    createdAt: ago(status === 'pending' ? int(2, 90) : int(300, 4000)),
  };
});
const verifiedRiders = riders.filter((r) => r.status === 'verified');

const PLACES = ['Ikeja City Mall', 'Murtala Muhammed Airport', 'Yaba Tech', 'Lekki Phase 1', 'Victoria Island', 'Surulere Stadium', 'Ojota Bus Stop', 'Maryland Mall', 'Ajah Roundabout', 'Gbagada Phase 2'];

export const bookings: Booking[] = Array.from({ length: 40 }, (_, i) => {
  const type = i % 3 === 0 ? 'delivery' : 'ride';
  const customer = person();
  const rider = pick(verifiedRiders);
  const distanceKm = Math.round((2 + rand() * 25) * 10) / 10;
  const fare = Math.ceil((500 + 100 * distanceKm) * (1 + rand())) * 1;
  const status = i < 4 ? 'cancelled' : pick(['pending', 'rider_accepted', 'accepted', 'picked_up', 'in_transit', 'completed', 'completed', 'completed']);
  const paymentStatus: Booking['paymentStatus'] =
    status === 'cancelled' ? (i < 3 ? 'paid' : 'refunded') : ['pending', 'rider_accepted'].includes(status) ? 'unpaid' : 'paid';
  return {
    id: id('b', i + 1),
    bookingRef: `${type === 'ride' ? 'RDE' : 'DLV'}-${20261100 + i}`,
    type,
    status,
    paymentStatus,
    customer: { id: customer.id, name: customer.name },
    rider: status === 'pending' && type === 'delivery' ? undefined : { id: rider.id, name: rider.name },
    pickup: pick(PLACES),
    dropoff: pick(PLACES),
    distanceKm,
    fare: Math.ceil(fare / 50) * 50,
    createdAt: ago(int(1, 300)),
  };
});

export const withdrawals: Withdrawal[] = Array.from({ length: 18 }, (_, i) => {
  const rider = verifiedRiders[i % verifiedRiders.length];
  const status: Withdrawal['status'] = i < 3 ? 'failed' : i < 5 ? 'manual' : i < 7 ? 'processing' : 'paid';
  return {
    id: id('w', i + 1),
    rider: { id: rider.id, name: rider.name },
    amount: int(2, 60) * 500,
    status,
    attempts: status === 'failed' ? 5 : status === 'paid' ? 1 : status === 'manual' ? 0 : 2,
    lastError: status === 'failed' ? pick(['Account name does not match', 'Beneficiary bank unavailable', 'Insufficient balance in payout wallet']) : undefined,
    bank: rider.payoutAccount?.bankName ?? pick(BANKS),
    accountNumberMasked: rider.payoutAccount?.accountNumberMasked ?? masked(String(int(1e9, 9e9))),
    requestedAt: ago(int(1, 150)),
  };
});

export const providers: DeliveryProvider[] = ['GIG Logistics', 'Kwik Delivery', 'Sendbox', 'Max.ng', 'Fez Delivery', 'Errandlr'].map((n, i) => ({
  id: id('p', i + 1),
  name: n,
  email: `ops@${n.toLowerCase().replace(/[^a-z]/g, '')}.ng`,
  phone: `+23490${int(10_000_000, 99_999_999)}`,
  status: i < 2 ? 'pending' : i === 5 ? 'rejected' : 'verified',
  coverage: i % 2 ? ['Lagos', 'Ogun'] : ['Lagos', 'FCT', 'Oyo', 'Rivers'],
  deliveriesCompleted: i < 2 ? 0 : int(40, 2000),
  createdAt: ago(int(10, 3000)),
}));

// ── Shopping ─────────────────────────────────────────────────────────────────

const GOODS: [string, number, string][] = [
  ['Wireless earbuds', 25, 'Electronics'],
  ['Ankara fabric (6 yards)', 18, 'Fashion'],
  ['Shea butter (500g)', 6, 'Beauty'],
  ['Phone power bank 20,000mAh', 22, 'Electronics'],
  ['Leather sandals', 30, 'Fashion'],
  ['Smart watch', 45, 'Electronics'],
  ['Black soap set', 8, 'Beauty'],
  ['Laptop backpack', 28, 'Accessories'],
  ['Adire tote bag', 15, 'Accessories'],
  ['Bluetooth speaker', 35, 'Electronics'],
];
const sellerPeople = people.filter((p) => p.isSeller);

export const products: Product[] = GOODS.map(([n, price, category], i) => {
  const seller = sellerPeople[i % sellerPeople.length];
  return {
    id: id('pr', i + 1),
    name: n,
    seller: { id: seller.id, name: seller.name },
    price,
    currency: pick(['cUSD', 'USDT']),
    stock: int(0, 80),
    category,
    visible: i !== 6,
    reports: i === 3 ? 4 : i === 5 ? 2 : 0,
    sponsored: i === 0,
    createdAt: ago(int(20, 3000)),
  };
});

export const shopOrders: ShopOrder[] = Array.from({ length: 30 }, (_, i) => {
  const product = products[i % products.length];
  const buyer = person();
  const quantity = int(1, 2);
  const status = i < 3 ? 'disputed' : pick(['pending', 'accepted', 'shipped', 'delivered', 'completed', 'completed']);
  return {
    id: id('so', i + 1),
    orderRef: `SH-${5200 + i}`,
    status,
    product: { id: product.id, name: product.name },
    buyer: { id: buyer.id, name: buyer.name },
    seller: product.seller,
    amount: product.price * quantity,
    currency: product.currency,
    quantity,
    held: ['accepted', 'shipped', 'delivered', 'disputed'].includes(status),
    createdAt: ago(int(1, 400)),
  };
});

export const shopDisputes: ShopDispute[] = shopOrders
  .filter((o) => o.status === 'disputed')
  .map((order, i) => ({
    id: id('sd', i + 1),
    order,
    reason: ['The item stopped working after two days', 'Seller sent a different colour', 'Buyer says it never arrived, but tracking shows delivered'][i],
    openedBy: i === 2 ? 'seller' : 'buyer',
    openedAt: ago(int(5, 60)),
    ruling: i === 1 ? { resolution: 'refund_buyer', by: 'finance@dezenmart.com', at: ago(3), note: 'Photos show the wrong colour', carriedOut: false } : undefined,
  }));

export const sellers: Seller[] = sellerPeople.map((p) => ({
  id: p.id,
  name: p.name,
  email: p.emailMasked,
  products: products.filter((x) => x.seller.id === p.id).length,
  ordersCompleted: shopOrders.filter((o) => o.seller.id === p.id && o.status === 'completed').length,
  disputes: shopOrders.filter((o) => o.seller.id === p.id && o.status === 'disputed').length,
  joinedAt: p.joinedAt,
}));

// ── money ────────────────────────────────────────────────────────────────────

export const payments: Payment[] = [
  ...foodOrders.slice(0, 20).map((o, i): Payment => ({
    id: id('pay', i + 1),
    service: 'food',
    reference: `PSC-${880100 + i}`,
    direction: 'in',
    purpose: `${o.buyer.name} paid for ${o.orderRef}`,
    amount: o.total,
    status: 'success',
    provider: 'Bank transfer',
    at: o.createdAt,
  })),
  ...foodOrders
    .filter((o) => o.payout)
    .map((o, i): Payment => ({
      id: id('pay', 100 + i),
      service: 'food',
      reference: `PSC-OUT-${7700 + i}`,
      direction: 'out',
      purpose: `Payout to ${o.vendor.name} for ${o.orderRef}`,
      amount: o.payout!.amount,
      status: o.payout!.status === 'failed' ? 'failed' : 'success',
      provider: 'Bank transfer',
      at: o.createdAt,
    })),
  ...bookings
    .filter((b) => b.paymentStatus !== 'unpaid')
    .map((b, i): Payment => ({
      id: id('pay', 200 + i),
      service: 'express',
      reference: `DVA-${330400 + i}`,
      direction: 'in',
      purpose: `${b.customer.name} paid for ${b.bookingRef}`,
      amount: b.fare,
      status: 'success',
      provider: 'Bank transfer',
      at: b.createdAt,
    })),
  ...withdrawals.map((w, i): Payment => ({
    id: id('pay', 300 + i),
    service: 'express',
    reference: `WDR-${5500 + i}`,
    direction: 'out',
    purpose: `Withdrawal to ${w.rider.name}`,
    amount: w.amount,
    status: w.status === 'paid' ? 'success' : w.status === 'failed' ? 'failed' : 'pending',
    provider: 'Bank transfer',
    at: w.requestedAt,
  })),
].sort((a, b) => b.at.localeCompare(a.at));

export const webhooks: WebhookEvent[] = Array.from({ length: 30 }, (_, i) => ({
  id: id('wh', i + 1),
  provider: pick(['Pandascrow', 'Korapay', 'Quidax']),
  event: pick(['deposit.success', 'transfer.success', 'transfer.failed', 'charge.success']),
  reference: `REF-${int(100_000, 999_999)}`,
  signatureOk: i !== 7,
  handled: i !== 7 && i !== 12,
  error: i === 7 ? 'Signature did not match' : i === 12 ? 'No booking found for this reference' : undefined,
  receivedAt: ago(i * 3 + rand()),
}));

export const reconciliation: ReconciliationRun[] = Array.from({ length: 7 }, (_, i) => {
  const off = i === 1 ? 12_500 : 0;
  const wallet = 4_820_000 + i * 37_500;
  return {
    id: id('rc', i + 1),
    ranAt: ago(24 * i + 2),
    ok: off === 0,
    checks: [
      { name: 'Payout wallet balance', ours: wallet, theirs: wallet - off, difference: off },
      { name: 'Deposits received yesterday', ours: 612_400 + i * 900, theirs: 612_400 + i * 900, difference: 0 },
      { name: 'Payouts sent yesterday', ours: 488_000 - i * 700, theirs: 488_000 - i * 700, difference: 0 },
    ],
  };
});

export const settings: Settings = {
  foodCommissionPercent: 0,
  foodServiceFeePercent: 0,
  expressPlatformFeePercent: 20,
  expressFare: { baseFare: 500, perKm: 100, minFare: 500, premiumMultiplier: 1.5, mediumParcelSurcharge: 300, largeParcelSurcharge: 700 },
  updatedAt: ago(400),
  updatedBy: 'owner@dezenmart.com',
};

// ── staff and activity ───────────────────────────────────────────────────────

export const staff: StaffMember[] = [
  { id: 's1', name: 'Ada Owner', email: 'owner@dezenmart.com', capabilities: ['support', 'verify', 'read_pii', 'move_money', 'staff_admin'], services: ['*'], authenticatorSet: true, disabled: false, lastSignInAt: ago(0.2), createdAt: ago(2000) },
  { id: 's2', name: 'Femi Finance', email: 'finance@dezenmart.com', capabilities: ['support', 'read_pii', 'move_money'], services: ['*'], authenticatorSet: true, disabled: false, lastSignInAt: ago(5), createdAt: ago(900) },
  { id: 's3', name: 'Bola Foods Ops', email: 'foods.ops@dezenmart.com', capabilities: ['support', 'verify'], services: ['food'], authenticatorSet: true, disabled: false, lastSignInAt: ago(20), createdAt: ago(300) },
  { id: 's4', name: 'Chidi Support', email: 'support@dezenmart.com', capabilities: ['support'], services: ['food', 'express'], authenticatorSet: false, disabled: false, createdAt: ago(30) },
  { id: 's5', name: 'Old Contractor', email: 'contractor@dezenmart.com', capabilities: ['support'], services: ['shopping'], authenticatorSet: true, disabled: true, lastSignInAt: ago(1500), createdAt: ago(3000) },
];

export const audit: AuditEvent[] = [
  { id: 'a3', staffEmail: 'finance@dezenmart.com', capability: 'move_money', service: 'shopping', summary: `Ruled "refund buyer" on ${shopDisputes[1]?.order.orderRef}`, action: 'POST /admin/shopping/disputes/:id/ruling', reason: 'Photos show the wrong colour', outcome: 'done', requestId: 'req-3', at: ago(3) },
  { id: 'a2', staffEmail: 'foods.ops@dezenmart.com', capability: 'move_money', service: 'food', summary: 'Tried to retry a vendor payout', action: 'POST /admin/food/orders/:id/retry-money', outcome: 'refused', requestId: 'req-2', at: ago(20) },
  { id: 'a1', staffEmail: 'owner@dezenmart.com', capability: 'verify', service: 'food', summary: 'Approved vendor Chop Life Grill', action: 'POST /admin/food/vendors/:id/review', outcome: 'done', requestId: 'req-1', at: ago(48) },
];

// ── timelines ────────────────────────────────────────────────────────────────

export const timelineFor = (createdAt: string, steps: [string, TimelineEntry['kind'], string?][]): TimelineEntry[] => {
  const start = new Date(createdAt).getTime();
  return steps.map(([text, kind, actor], i) => ({ at: new Date(start + i * 25 * 60_000).toISOString(), kind, text, actor }));
};
