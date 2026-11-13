/**
 * The admin API contract. Every screen is built against these shapes; the backend checklist
 * (docs/BACKEND_CHECKLIST.md) lists each endpoint that returns them. Sample data in src/mocks
 * follows the same shapes, so switching to the real backend needs no screen changes.
 *
 * Conventions the backend should keep:
 *  - Responses are { status: 'success', data: … }; errors are { status: 'fail' | 'error', message }.
 *  - Lists are paged: { items, total, page, limit }.
 *  - Money is in naira as a number (₦12,500 → 12500). Dates are ISO strings.
 *  - Personal details are masked unless the endpoint says otherwise.
 */

export type Capability = 'support' | 'verify' | 'read_pii' | 'move_money' | 'chain_ops' | 'staff_admin';
export type Service = 'food' | 'express' | 'shopping' | 'platform';

export interface Envelope<T> {
  status: string;
  data: T;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface Session {
  token: string;
  email: string;
  capabilities: Capability[];
  services: (Service | '*')[];
}

/** One entry in a record's history: what happened, when, and who did it. */
export interface TimelineEntry {
  at: string;
  kind: 'status' | 'payment' | 'staff' | 'message';
  text: string;
  actor?: string;
}

// ── home ─────────────────────────────────────────────────────────────────────

export interface QueueItem {
  key: string;
  service: Service;
  label: string;
  count: number;
  /** The oldest item's age decides the order on Home. */
  oldestAt?: string;
  /** Where the operator goes to work the queue, e.g. "/food/vendors?status=pending". */
  link: string;
  /** Money or safety at stake: shown first and in red. */
  urgent?: boolean;
  /** Naira waiting in this queue (money owed, stuck or in dispute). Null when the queue is not about money. */
  amountAtStake?: number | null;
  /** One line on what the items are, e.g. "2 vendor payouts · 1 buyer refund". */
  detail?: string;
}

/**
 * What every money action returns, shown as the receipt. The backend must send it: the admin
 * never shows money as sent from its own guess.
 */
export interface MoneyReceipt {
  reference: string;
  amount: number;
  currency: string;
  recipient: string;
  /** "sent" once accepted by the bank or provider; "recorded" for a ruling or hand payment. */
  state: 'sent' | 'recorded';
  at: string;
  by: string;
  /** Where to go next in the same queue, if anything is left. */
  next?: { label: string; link: string };
}

export interface SearchResult {
  kind: 'person' | 'order' | 'booking' | 'payment' | 'vendor' | 'rider';
  service: Service;
  id: string;
  title: string;
  subtitle: string;
  link: string;
}

// ── DezenFoods ───────────────────────────────────────────────────────────────

export type VendorStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface Vendor {
  id: string;
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  phone: string;
  address: string;
  lga: string;
  state: string;
  categories: string[];
  status: VendorStatus;
  rejectionReason?: string;
  payoutAccount: { bankName: string; accountName: string; accountNumberMasked: string };
  ordersCompleted: number;
  createdAt: string;
}

export type MoneyStatus = 'pending' | 'processing' | 'paid' | 'failed';

export interface FoodOrder {
  id: string;
  orderRef: string;
  status: string;
  vendor: { id: string; name: string };
  buyer: { id: string; name: string };
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  fulfilment: 'delivery' | 'pickup';
  payout?: { status: MoneyStatus; amount: number; attempts: number; lastError?: string };
  refund?: { status: MoneyStatus; amount: number; attempts: number; lastError?: string };
  dispute?: { reason: string; openedAt: string; resolved: boolean };
  /** The case file for a dispute: the other side and each party's track record. */
  case?: {
    vendorSays?: string;
    whatHappened?: string;
    buyerDisputes90d: number;
    buyerOrders: number;
    vendorDisputesLost: number;
  };
  createdAt: string;
}

export interface FoodOrderDetail extends FoodOrder {
  timeline: TimelineEntry[];
}

// ── DezenExpress ─────────────────────────────────────────────────────────────

export type RiderStatus = 'pending' | 'verified' | 'rejected';

export interface Rider {
  id: string;
  name: string;
  email: string;
  phone: string;
  vehicleType: string;
  plateNumber: string;
  licenceNumber: string;
  status: RiderStatus;
  online: boolean;
  walletBalance: number;
  tripsCompleted: number;
  payoutAccount?: { bankName: string; accountName: string; accountNumberMasked: string };
  createdAt: string;
}

export interface Booking {
  id: string;
  bookingRef: string;
  type: 'ride' | 'delivery';
  status: string;
  paymentStatus: 'unpaid' | 'paid' | 'refunded' | 'refund_pending' | 'refund_failed';
  customer: { id: string; name: string };
  rider?: { id: string; name: string };
  pickup: string;
  dropoff: string;
  distanceKm: number;
  fare: number;
  createdAt: string;
}

export interface BookingDetail extends Booking {
  timeline: TimelineEntry[];
}

export interface Withdrawal {
  id: string;
  rider: { id: string; name: string };
  amount: number;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'manual';
  attempts: number;
  lastError?: string;
  bank: string;
  accountNumberMasked: string;
  requestedAt: string;
}

export interface DeliveryProvider {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'pending' | 'verified' | 'rejected';
  coverage: string[];
  deliveriesCompleted: number;
  createdAt: string;
}

// ── Shopping ─────────────────────────────────────────────────────────────────

export interface ShopOrder {
  id: string;
  orderRef: string;
  status: string;
  product: { id: string; name: string };
  buyer: { id: string; name: string };
  seller: { id: string; name: string };
  amount: number;
  currency: string;
  quantity: number;
  /** Paid into the payment contract and held until delivery is confirmed. */
  held: boolean;
  createdAt: string;
}

export interface ShopOrderDetail extends ShopOrder {
  timeline: TimelineEntry[];
}

export interface ShopDispute {
  id: string;
  order: ShopOrder;
  reason: string;
  openedBy: 'buyer' | 'seller';
  openedAt: string;
  /** A ruling staff made, waiting for an owner to carry it out. */
  ruling?: { resolution: 'refund_buyer' | 'release_to_seller'; by: string; at: string; note: string; carriedOut: boolean };
}

export interface Product {
  id: string;
  name: string;
  seller: { id: string; name: string };
  price: number;
  currency: string;
  stock: number;
  category: string;
  image?: string;
  visible: boolean;
  reports: number;
  sponsored: boolean;
  createdAt: string;
}

export interface Seller {
  id: string;
  name: string;
  email: string;
  products: number;
  ordersCompleted: number;
  disputes: number;
  joinedAt: string;
}

// ── platform ─────────────────────────────────────────────────────────────────

/** A person, masked: phone and email are partly hidden until revealed. */
export interface PersonSummary {
  id: string;
  name: string;
  emailMasked: string;
  phoneMasked?: string;
  isSeller: boolean;
  isVendor: boolean;
  isRider: boolean;
  joinedAt: string;
}

export interface PersonDetail extends PersonSummary {
  /** Amounts are naira (currency 'NGN') except Shopping, which is priced in stablecoins such as cUSD. */
  activity: { service: Service; kind: 'order' | 'booking'; ref: string; status: string; amount: number; currency: string; at: string; link: string }[];
  payments: Payment[];
}

/** Full details: only from the reveal endpoint, and every reveal is logged. */
export interface PersonPrivate {
  email: string;
  phone?: string;
  address?: string;
  bankName?: string;
  accountNumber?: string;
}

export interface Payment {
  id: string;
  service: Service;
  reference: string;
  direction: 'in' | 'out';
  /** What the money was for, in plain words: "Buyer paid for FD-1043", "Payout to Mama Put Kitchen". */
  purpose: string;
  amount: number;
  status: 'pending' | 'success' | 'failed' | 'reversed';
  provider: string;
  at: string;
}

export interface WebhookEvent {
  id: string;
  provider: string;
  event: string;
  reference?: string;
  signatureOk: boolean;
  handled: boolean;
  error?: string;
  receivedAt: string;
}

export interface ReconciliationRun {
  id: string;
  ranAt: string;
  checks: { name: string; ours: number; theirs: number; difference: number }[];
  ok: boolean;
}

export interface Settings {
  foodCommissionPercent: number;
  foodServiceFeePercent: number;
  expressPlatformFeePercent: number;
  expressFare: {
    baseFare: number;
    perKm: number;
    minFare: number;
    premiumMultiplier: number;
    mediumParcelSurcharge: number;
    largeParcelSurcharge: number;
  };
  updatedAt: string;
  updatedBy: string;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  capabilities: Capability[];
  services: (Service | '*')[];
  authenticatorSet: boolean;
  disabled: boolean;
  lastSignInAt?: string;
  createdAt: string;
}

export interface StaffOverview {
  staff: StaffMember[];
  presets: Record<string, Capability[]>;
}

export interface AuditEvent {
  id: string;
  staffEmail: string;
  capability?: Capability;
  service?: Service;
  /** Plain words, written by the backend: "Approved vendor Mama Put Kitchen". */
  summary: string;
  action: string;
  reason?: string;
  outcome: 'done' | 'refused' | 'failed';
  requestId: string;
  at: string;
}
