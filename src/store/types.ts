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

/**
 * Who is handling a record. One person at a time: the backend refuses money actions from anyone
 * else until the claim is released or taken over, so two staff never pay the same thing twice.
 */
export interface Claim {
  by: string;
  name: string;
  since: string;
  /** Last time the holder did something on it. A claim lapses after 2 hours without activity. */
  activeAt?: string;
}
export type ClaimKind = 'food-order' | 'booking' | 'withdrawal' | 'shop-dispute';

/**
 * A money action above the approval threshold waits here for a second person. Approving it moves
 * the money; the person who asked can never approve their own request.
 */
export interface Approval {
  id: string;
  service: Service;
  /** Plain words: "Send ₦180,000 to Halima Eze again". */
  summary: string;
  amount: number;
  currency: string;
  /** For coin amounts: the naira value fixed at payment. */
  amountNgn?: number;
  recipient: string;
  reason: string;
  /**
   * What already happened to this money, so the approver never approves a resend blind:
   * "Tried 5 times, last on 11 Nov, to Access Bank ******9013. The bank said: Account name does not match."
   */
  before?: string;
  /** The requester's name, for people; requestedBy stays the email for the record. */
  requestedByName?: string;
  requestedBy: string;
  requestedAt: string;
  /** The record the money belongs to, in the admin. */
  link: string;
  /** The exact record, so it shows as waiting and cannot be sent twice meanwhile. */
  target: { kind: ClaimKind | 'rider-wallet'; id: string };
  status: 'pending' | 'approved' | 'declined';
  decidedBy?: string;
  decidedAt?: string;
  declineReason?: string;
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
  /** For coin amounts: the naira value fixed at payment. */
  amountNgn?: number;
  recipient: string;
  /**
   * "sent" once accepted by the bank or provider; "recorded" for a ruling or hand payment;
   * "awaiting_approval" when the amount is above the threshold and a second person must approve.
   */
  state: 'sent' | 'recorded' | 'awaiting_approval';
  approvalId?: string;
  at: string;
  by: string;
  /** Where to go next in the same queue, if anything is left. */
  next?: { label: string; link: string };
}

/**
 * Home, built around the signed-in person's shift: the one thing to take next, the work grouped by
 * what they will do, the people settled today, and each service's state for the living mark.
 * The backend tailors all of it to the person's capabilities and services.
 */
export interface HomeData {
  /** People waiting longer than their promise (24h for money, 48h for rulings and reviews). */
  latePeople: number;
  waitingPeople: number;
  oldestAt?: string;
  /** The most urgent thing this person can act on now, or null when nothing is waiting. */
  next: HomeNext | null;
  groups: HomeGroup[];
  today: HomeToday;
  /** One entry per service the person covers, for the living mark. */
  services: HomeService[];
}

/** Which queue page an item belongs to. */
export type QueueKey = 'approvals' | 'withdrawals' | 'refunds' | 'food-money' | 'food-disputes' | 'shop-disputes' | 'riders' | 'vendors' | 'providers' | 'products';

/**
 * The top of a queue page, worked out for the person asking: how many people wait, how many are past
 * our promise, and the one to take next (the one they hold, else the oldest nobody else holds).
 */
export interface QueueTop {
  key: QueueKey;
  promiseHours: number;
  waitingPeople: number;
  latePeople: number;
  oldestAt?: string;
  /** Others holding items here: "Femi on 1". */
  claimedBy: { name: string; count: number }[];
  /** False when the person can see this queue but cannot act on it. */
  canAct: boolean;
  next: HomeNext | null;
}

export interface HomeNext {
  /** Our promise for this kind of work, in hours: 24 to pay or approve, 48 to rule or review. */
  promiseHours?: number;
  /** "Rider withdrawal", "Refund due", "Dispute", "Approval". */
  kind: string;
  service: Service;
  /** A sentence with the person first: "Musa Eze has waited 5 days for ₦25,500". */
  title: string;
  /** Why it is waiting and whether acting is safe, in plain words. */
  why: string;
  amount?: number;
  waitingSince: string;
  link: string;
  /** Set when "Take it" should claim a record before opening it. */
  claim?: { kind: ClaimKind; id: string };
  /** Set when the person is already handling this. */
  yours?: boolean;
}

export type HomeVerb = 'approve' | 'pay' | 'rule' | 'review';

export interface HomeGroup {
  verb: HomeVerb;
  /** "Waiting on your approval", "People owed money", "Needs your ruling", "To review". */
  label: string;
  /** "11 people · ₦322,670". */
  summary: string;
  rows: HomeRow[];
}

export interface HomeRow {
  key: string;
  service: Service;
  /** People first: "4 riders couldn't withdraw". */
  title: string;
  detail: string;
  amount?: number | null;
  count: number;
  oldestAt?: string;
  /** Older than its promise. */
  late: boolean;
  link: string;
  /** Who else is on items in this row: "Femi on 1". */
  claimedBy: { name: string; count: number }[];
  /** False when the person can look but not act (shown as view only). */
  canAct: boolean;
}

export interface HomeToday {
  mine: { people: number; amount: number };
  team: { people: number; amount: number };
  /** Newest first: "Chiamaka has her refund". */
  settled: { text: string; amount?: number; currency?: string; by: string; at: string; link?: string }[];
  /** The last 7 days, oldest first: people settled vs new people waiting. */
  week: { day: string; cleared: number; added: number }[];
}

export interface HomeService {
  service: Service;
  /** Money owed to people in this service (refunds and payouts; disputes are not owed yet). */
  owed: number;
  people: number;
  late: boolean;
}

export interface SearchResult {
  kind: 'person' | 'order' | 'booking' | 'payment' | 'vendor' | 'rider';
  service: Service;
  id: string;
  title: string;
  subtitle: string;
  link: string;
  /** Where it stands, so staff can answer without opening it. A status key the Status chip knows. */
  status?: string;
  /** Money at stake, in naira. */
  amount?: number;
}

// ── DezenFoods ───────────────────────────────────────────────────────────────

export type VendorStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

/**
 * A newcomer to review (a kitchen, a rider, a delivery company), as one case: what they sent us,
 * what to check it against, and the decision. Approve is refused unless every check is ticked;
 * the ticked checks are saved with the decision in the activity log.
 */
export type ReviewKind = 'vendor' | 'rider' | 'provider';
export interface ReviewCase {
  kind: ReviewKind;
  id: string;
  service: Service;
  /** The name staff call them by: "Ifeoma Nwosu", "Mama Put Kitchen". */
  name: string;
  /** One line under the name: "Motorbike · LAG-463AA". */
  summary: string;
  status: 'pending' | 'approved' | 'verified' | 'rejected' | 'suspended';
  appliedAt: string;
  /** What they typed when they applied. */
  facts: { label: string; value: string }[];
  /** What they uploaded. `url` is a short-lived link the backend signs; missing means no image to show. */
  documents: { id: string; label: string; caption?: string; url?: string }[];
  /** What to compare. `expected` is what they typed, shown beside the check. */
  checks: { id: string; label: string; expected?: string }[];
  /** Set when they were asked to fix something; they see this reason. */
  rejectionReason?: string;
}

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
  claim?: Claim | null;
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
  claim?: Claim | null;
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
  claim?: Claim | null;
  /** A request to send this is waiting for a second approval: no one should send it again meanwhile. */
  awaitingApproval?: boolean;
  id: string;
  rider: { id: string; name: string };
  amount: number;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'manual';
  attempts: number;
  lastError?: string;
  /** When the last attempt was made, so "Send again" can show what happened the first time. */
  lastAttemptAt?: string;
  /**
   * What actually unsticks it, decided by the backend from the bank's answer. Sending again only helps
   * when the cause was on the bank's side; a wrong account name needs the rider, an empty payout
   * wallet needs finance to top it up.
   */
  nextStep?: 'send_again' | 'rider_fixes_bank' | 'top_up_wallet' | 'pay_by_hand' | 'awaiting_approval' | 'rider_asked';
  /** When we last asked the rider to fix their bank details. */
  riderAskedAt?: string;
  /** When the rider changed their bank details after the bank refused the name. Sending again is then worth trying. */
  bankDetailsUpdatedAt?: string;
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
  /** What the buyer paid in naira, fixed at the moment of payment. Staff see this; the coin amount is small print. */
  amountNgn: number;
  quantity: number;
  /** Paid into the payment contract and held until delivery is confirmed. */
  held: boolean;
  createdAt: string;
}

export interface ShopOrderDetail extends ShopOrder {
  timeline: TimelineEntry[];
}

export interface ShopDispute {
  claim?: Claim | null;
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
  /** The price in naira at today's rate, for staff. */
  priceNgn: number;
  stock: number;
  category: string;
  image?: string;
  visible: boolean;
  reports: number;
  /** What buyers wrote when they reported it, newest first. */
  reportNotes?: { text: string; at: string }[];
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
  /**
   * Where they stand with us, before their history: money we still owe them, cases still open,
   * and how often they dispute. Support reads this first when the person calls.
   */
  standing: {
    owedToThem: { text: string; amount: number; since: string; link: string }[];
    openCases: { text: string; since: string; link: string }[];
    disputes90d: number;
    orders: number;
  };
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
  /** Money actions above this many naira need a second person to approve. */
  approvalThreshold: number;
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
  /** The person's name, for reading; the email stays for the record. */
  staffName?: string;
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
