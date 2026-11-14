import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { API_URL, USE_SAMPLE_DATA } from '../lib/config';
import { sampleBaseQuery } from '../mocks/backend';
import { signedOut } from './session';
import type {
  Approval,
  HomeData,
  QueueKey,
  QueueTop,
  ReviewCase,
  ReviewKind,
  AuditEvent,
  Claim,
  ClaimKind,
  Booking,
  BookingDetail,
  DeliveryProvider,
  Envelope,
  FoodOrder,
  FoodOrderDetail,
  MoneyReceipt,
  Page,
  Payment,
  PersonDetail,
  PersonPrivate,
  PersonSummary,
  Product,
  QueueItem,
  ReconciliationRun,
  Rider,
  SearchResult,
  Seller,
  Session,
  Settings,
  ShopDispute,
  ShopOrder,
  ShopOrderDetail,
  StaffOverview,
  Vendor,
  VendorStatus,
  WebhookEvent,
  Withdrawal,
} from './types';

type State = { session: { googleToken: string | null; staffToken: string | null } };
/** 'google' for the three sign-in calls; everything else uses the staff token. */
type Extra = { auth?: 'google' };

const http = (token: 'google' | 'staff') =>
  fetchBaseQuery({
    baseUrl: API_URL,
    prepareHeaders: (headers, { getState }) => {
      const s = (getState() as State).session;
      const t = token === 'google' ? s.googleToken : s.staffToken;
      if (t) headers.set('Authorization', `Bearer ${t}`);
      return headers;
    },
  });
const withGoogle = http('google');
const withStaff = http('staff');

/** A 401 that means the staff session is over (not a wrong authenticator code) signs out. */
const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError, Extra> = async (args, api, extra) => {
  const result = USE_SAMPLE_DATA
    ? await sampleBaseQuery(args)
    : await (extra?.auth === 'google' ? withGoogle : withStaff)(args, api, extra ?? {});
  const message = (result.error?.data as { message?: string } | undefined)?.message ?? '';
  if (result.error?.status === 401 && extra?.auth !== 'google' && /session has ended|sign-in required/i.test(message)) {
    api.dispatch(signedOut());
  }
  return result;
};

/** Money and staff changes carry a fresh authenticator code in a header, never in the body. */
const withCode = (code: string) => ({ 'X-Admin-Code': code });
const unwrap = <T,>(r: Envelope<T>) => r.data;

export type CodeArgs = { code: string; reason?: string };
type PageArgs = { page?: number; status?: string; q?: string; type?: string; provider?: string };

const TAGS = [
  'Queues',
  'Vendors',
  'FoodOrders',
  'Riders',
  'Bookings',
  'Withdrawals',
  'Providers',
  'ShopOrders',
  'ShopDisputes',
  'Products',
  'People',
  'Settings',
  'Staff',
  'Audit',
  'Approvals',
] as const;

export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: TAGS,
  endpoints: (b) => ({
    // ── sign-in ──
    setupAuthenticator: b.mutation<{ secret: string; otpauthUrl: string }, void>({
      query: () => ({ url: '/admin/auth/authenticator/setup', method: 'POST' }),
      extraOptions: { auth: 'google' },
      transformResponse: unwrap,
    }),
    confirmAuthenticator: b.mutation<unknown, { code: string }>({
      query: (body) => ({ url: '/admin/auth/authenticator/confirm', method: 'POST', body }),
      extraOptions: { auth: 'google' },
    }),
    startSession: b.mutation<Session, { code: string }>({
      query: (body) => ({ url: '/admin/auth/session', method: 'POST', body }),
      extraOptions: { auth: 'google' },
      transformResponse: unwrap,
    }),
    me: b.query<Omit<Session, 'token'>, void>({ query: () => '/admin/auth/me', transformResponse: unwrap }),
    signOut: b.mutation<unknown, void>({ query: () => ({ url: '/admin/auth/sign-out', method: 'POST' }) }),

    // ── claims: who is handling what ──
    claim: b.mutation<Claim, { kind: ClaimKind; id: string; takeOver?: boolean }>({
      query: (body) => ({ url: '/admin/claims', method: 'POST', body }),
      invalidatesTags: ['FoodOrders', 'Bookings', 'Withdrawals', 'ShopDisputes', 'Queues', 'Audit'],
      transformResponse: unwrap,
    }),
    release: b.mutation<unknown, { kind: ClaimKind; id: string }>({
      query: ({ kind, id }) => ({ url: `/admin/claims/${kind}/${id}`, method: 'DELETE' }),
      invalidatesTags: ['FoodOrders', 'Bookings', 'Withdrawals', 'ShopDisputes', 'Queues', 'Audit'],
    }),

    // ── second approver ──
    approvals: b.query<Page<Approval>, PageArgs>({
      query: (params) => ({ url: '/admin/approvals', params }),
      providesTags: ['Approvals'],
      transformResponse: unwrap,
    }),
    approve: b.mutation<MoneyReceipt, { id: string; amount: number } & CodeArgs>({
      query: ({ id, amount, code }) => ({ url: `/admin/approvals/${id}/approve`, method: 'POST', body: { amount }, headers: withCode(code) }),
      invalidatesTags: ['Approvals', 'Queues', 'FoodOrders', 'Bookings', 'Withdrawals', 'Riders', 'ShopDisputes', 'Audit'],
      transformResponse: unwrap,
    }),
    decline: b.mutation<unknown, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/admin/approvals/${id}/decline`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Approvals', 'Queues', 'Audit'],
    }),

    // ── home ──
    queueTop: b.query<QueueTop, QueueKey>({ query: (key) => `/admin/queue/${key}`, providesTags: ['Queues'], transformResponse: unwrap }),
    home: b.query<HomeData, void>({ query: () => '/admin/home', providesTags: ['Queues'], transformResponse: unwrap }),
    queues: b.query<QueueItem[], void>({ query: () => '/admin/queues', providesTags: ['Queues'], transformResponse: unwrap }),
    search: b.query<SearchResult[], string>({
      query: (q) => ({ url: '/admin/search', params: { q } }),
      transformResponse: unwrap,
    }),

    // ── DezenFoods ──
    vendors: b.query<Page<Vendor>, PageArgs>({
      query: (params) => ({ url: '/admin/food/vendors', params }),
      providesTags: ['Vendors'],
      transformResponse: unwrap,
    }),
    reviewCase: b.query<ReviewCase, { kind: ReviewKind; id: string }>({
      query: ({ kind, id }) => `/admin/reviews/${kind}/${id}`,
      providesTags: ['Vendors', 'Riders', 'Providers'],
      transformResponse: unwrap,
    }),
    reviewVendor: b.mutation<unknown, { id: string; status: Exclude<VendorStatus, 'pending'>; reason?: string; checks?: string[] }>({
      query: ({ id, ...body }) => ({ url: `/admin/food/vendors/${id}/review`, method: 'POST', body }),
      invalidatesTags: ['Vendors', 'Queues', 'Audit'],
    }),
    foodOrders: b.query<Page<FoodOrder>, PageArgs>({
      query: (params) => ({ url: '/admin/food/orders', params }),
      providesTags: ['FoodOrders'],
      transformResponse: unwrap,
    }),
    foodOrder: b.query<FoodOrderDetail, string>({
      query: (id) => `/admin/food/orders/${id}`,
      providesTags: ['FoodOrders'],
      transformResponse: unwrap,
    }),
    retryFoodMoney: b.mutation<MoneyReceipt, { id: string; amount: number } & CodeArgs>({
      query: ({ id, code, amount }) => ({ url: `/admin/food/orders/${id}/retry-money`, method: 'POST', body: { amount }, headers: withCode(code) }),
      transformResponse: unwrap,
      invalidatesTags: ['FoodOrders', 'Queues', 'Approvals', 'Audit'],
    }),
    foodDisputes: b.query<Page<FoodOrder>, PageArgs>({
      query: (params) => ({ url: '/admin/food/disputes', params }),
      providesTags: ['FoodOrders'],
      transformResponse: unwrap,
    }),
    resolveFoodDispute: b.mutation<MoneyReceipt, { id: string; resolution: 'refund_buyer' | 'release_to_vendor' | 'split'; amount: number; vendorAmount?: number } & CodeArgs>({
      transformResponse: unwrap,
      query: ({ id, code, resolution, reason, amount, vendorAmount }) => ({
        url: `/admin/food/disputes/${id}/resolve`,
        method: 'POST',
        body: { resolution, note: reason, amount, vendorAmount },
        headers: withCode(code),
      }),
      invalidatesTags: ['FoodOrders', 'Queues', 'Approvals', 'Audit'],
    }),

    // ── DezenExpress ──
    riders: b.query<Page<Rider>, PageArgs>({
      query: (params) => ({ url: '/admin/express/riders', params }),
      providesTags: ['Riders'],
      transformResponse: unwrap,
    }),
    verifyRider: b.mutation<unknown, { id: string; status: 'verified' | 'rejected'; reason?: string; checks?: string[] }>({
      query: ({ id, ...body }) => ({ url: `/admin/express/riders/${id}/verify`, method: 'PATCH', body }),
      invalidatesTags: ['Riders', 'Queues', 'Audit'],
    }),
    adjustRiderWallet: b.mutation<MoneyReceipt, { id: string; amount: number; direction: 'credit' | 'debit' } & CodeArgs>({
      query: ({ id, code, amount, direction, reason }) => ({
        url: `/admin/express/riders/${id}/wallet-adjustments`,
        method: 'POST',
        body: { amount, direction, reason },
        headers: withCode(code),
      }),
      invalidatesTags: ['Riders', 'Queues', 'Approvals', 'Audit'],
      transformResponse: unwrap,
    }),
    bookings: b.query<Page<Booking>, PageArgs>({
      query: (params) => ({ url: '/admin/express/bookings', params }),
      providesTags: ['Bookings'],
      transformResponse: unwrap,
    }),
    booking: b.query<BookingDetail, string>({
      query: (id) => `/admin/express/bookings/${id}`,
      providesTags: ['Bookings'],
      transformResponse: unwrap,
    }),
    refundBooking: b.mutation<MoneyReceipt, { id: string; amount: number } & CodeArgs>({
      query: ({ id, code, amount, reason }) => ({
        url: `/admin/express/bookings/${id}/refund`,
        method: 'POST',
        body: { amount, reason },
        headers: withCode(code),
      }),
      invalidatesTags: ['Bookings', 'Queues', 'Approvals', 'Audit'],
      transformResponse: unwrap,
    }),
    withdrawals: b.query<Page<Withdrawal>, PageArgs>({
      query: (params) => ({ url: '/admin/express/withdrawals', params }),
      providesTags: ['Withdrawals'],
      transformResponse: unwrap,
    }),
    askRiderToFixBank: b.mutation<{ asked: boolean }, { id: string }>({
      query: ({ id }) => ({ url: `/admin/express/withdrawals/${id}/ask-rider`, method: 'POST', body: {} }),
      transformResponse: unwrap,
      invalidatesTags: ['Withdrawals', 'Queues', 'Audit'],
    }),
    retryWithdrawal: b.mutation<MoneyReceipt, { id: string; amount: number } & CodeArgs>({
      query: ({ id, code, amount }) => ({ url: `/admin/express/withdrawals/${id}/retry`, method: 'POST', body: { amount }, headers: withCode(code) }),
      transformResponse: unwrap,
      invalidatesTags: ['Withdrawals', 'Queues', 'Approvals', 'Audit'],
    }),
    markWithdrawalPaid: b.mutation<MoneyReceipt, { id: string; transferReference: string; amount: number } & CodeArgs>({
      transformResponse: unwrap,
      query: ({ id, code, transferReference, reason, amount }) => ({
        url: `/admin/express/withdrawals/${id}/mark-paid`,
        method: 'POST',
        body: { transferReference, reason, amount },
        headers: withCode(code),
      }),
      invalidatesTags: ['Withdrawals', 'Queues', 'Approvals', 'Audit'],
    }),
    providers: b.query<Page<DeliveryProvider>, PageArgs>({
      query: (params) => ({ url: '/admin/express/providers', params }),
      providesTags: ['Providers'],
      transformResponse: unwrap,
    }),
    verifyProvider: b.mutation<unknown, { id: string; status: 'verified' | 'rejected'; reason?: string; checks?: string[] }>({
      query: ({ id, ...body }) => ({ url: `/admin/express/providers/${id}/verify`, method: 'PATCH', body }),
      invalidatesTags: ['Providers', 'Queues', 'Audit'],
    }),

    // ── Shopping ──
    shopOrders: b.query<Page<ShopOrder>, PageArgs>({
      query: (params) => ({ url: '/admin/shopping/orders', params }),
      providesTags: ['ShopOrders'],
      transformResponse: unwrap,
    }),
    shopOrder: b.query<ShopOrderDetail, string>({
      query: (id) => `/admin/shopping/orders/${id}`,
      providesTags: ['ShopOrders'],
      transformResponse: unwrap,
    }),
    shopDisputes: b.query<Page<ShopDispute>, PageArgs>({
      query: (params) => ({ url: '/admin/shopping/disputes', params }),
      providesTags: ['ShopDisputes'],
      transformResponse: unwrap,
    }),
    ruleShopDispute: b.mutation<MoneyReceipt, { id: string; resolution: 'refund_buyer' | 'release_to_seller'; amount: number } & CodeArgs>({
      transformResponse: unwrap,
      query: ({ id, code, resolution, reason, amount }) => ({
        url: `/admin/shopping/disputes/${id}/ruling`,
        method: 'POST',
        body: { resolution, note: reason, amount },
        headers: withCode(code),
      }),
      invalidatesTags: ['ShopDisputes', 'Queues', 'Approvals', 'Audit'],
    }),
    products: b.query<Page<Product>, PageArgs>({
      query: (params) => ({ url: '/admin/shopping/products', params }),
      providesTags: ['Products'],
      transformResponse: unwrap,
    }),
    keepProduct: b.mutation<unknown, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/admin/shopping/products/${id}/keep`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Products', 'Queues', 'Audit'],
    }),
    setProductVisibility: b.mutation<unknown, { id: string; visible: boolean; reason?: string }>({
      query: ({ id, visible, reason }) => ({
        url: `/admin/shopping/products/${id}/${visible ? 'show' : 'hide'}`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: ['Products', 'Queues', 'Audit'],
    }),
    setProductSponsored: b.mutation<unknown, { id: string; sponsored: boolean }>({
      query: ({ id, sponsored }) => ({ url: `/admin/shopping/products/${id}/sponsored`, method: 'PUT', body: { sponsored } }),
      invalidatesTags: ['Products', 'Audit'],
    }),
    sellers: b.query<Page<Seller>, PageArgs>({
      query: (params) => ({ url: '/admin/shopping/sellers', params }),
      transformResponse: unwrap,
    }),

    // ── people ──
    people: b.query<Page<PersonSummary>, PageArgs>({
      query: (params) => ({ url: '/admin/platform/users', params }),
      providesTags: ['People'],
      transformResponse: unwrap,
    }),
    person: b.query<PersonDetail, string>({
      query: (id) => `/admin/platform/users/${id}`,
      providesTags: ['People'],
      transformResponse: unwrap,
    }),
    revealPerson: b.mutation<PersonPrivate, { id: string; reason: string; code: string }>({
      query: ({ id, reason, code }) => ({ url: `/admin/platform/users/${id}/reveal`, method: 'POST', body: { reason }, headers: withCode(code) }),
      invalidatesTags: ['Audit'],
      transformResponse: unwrap,
    }),

    // ── money ──
    payments: b.query<Page<Payment>, PageArgs>({
      query: (params) => ({ url: '/admin/platform/payments', params }),
      transformResponse: unwrap,
    }),
    webhooks: b.query<Page<WebhookEvent>, PageArgs>({
      query: (params) => ({ url: '/admin/platform/webhooks', params }),
      transformResponse: unwrap,
    }),
    reconciliation: b.query<ReconciliationRun[], void>({
      query: () => '/admin/platform/reconciliation',
      transformResponse: unwrap,
    }),

    // ── settings ──
    settings: b.query<Settings, void>({
      query: () => '/admin/platform/settings',
      providesTags: ['Settings'],
      transformResponse: unwrap,
    }),
    updateSettings: b.mutation<unknown, { changes: Partial<Settings> } & CodeArgs>({
      query: ({ changes, code, reason }) => ({
        url: '/admin/platform/settings',
        method: 'PUT',
        body: { ...changes, reason },
        headers: withCode(code),
      }),
      invalidatesTags: ['Settings', 'Audit'],
    }),

    // ── staff ──
    staff: b.query<StaffOverview, void>({ query: () => '/admin/staff', providesTags: ['Staff'], transformResponse: unwrap }),
    grantStaff: b.mutation<unknown, { email: string; preset: string; services: string[] } & CodeArgs>({
      query: ({ code, email, preset, services }) => ({
        url: '/admin/staff',
        method: 'POST',
        body: { email, preset, services },
        headers: withCode(code),
      }),
      invalidatesTags: ['Staff', 'Audit'],
    }),
    staffAction: b.mutation<unknown, { id: string; action: 'disable' | 'enable' | 'reset-authenticator' } & CodeArgs>({
      query: ({ id, action, code }) => ({ url: `/admin/staff/${id}/${action}`, method: 'POST', headers: withCode(code) }),
      invalidatesTags: ['Staff', 'Audit'],
    }),

    // ── activity log ──
    audit: b.query<Page<AuditEvent>, PageArgs & { service?: string }>({
      query: (params) => ({ url: '/admin/audit', params }),
      providesTags: ['Audit'],
      transformResponse: unwrap,
    }),
  }),
});

export const {
  useSetupAuthenticatorMutation,
  useConfirmAuthenticatorMutation,
  useStartSessionMutation,
  useMeQuery,
  useSignOutMutation,
  useQueuesQuery,
  useHomeQuery,
  useQueueTopQuery,
  useKeepProductMutation,
  useReviewCaseQuery,
  useAskRiderToFixBankMutation,
  useClaimMutation,
  useReleaseMutation,
  useApprovalsQuery,
  useApproveMutation,
  useDeclineMutation,
  useSearchQuery,
  useVendorsQuery,
  useReviewVendorMutation,
  useFoodOrdersQuery,
  useFoodOrderQuery,
  useRetryFoodMoneyMutation,
  useFoodDisputesQuery,
  useResolveFoodDisputeMutation,
  useRidersQuery,
  useVerifyRiderMutation,
  useAdjustRiderWalletMutation,
  useBookingsQuery,
  useBookingQuery,
  useRefundBookingMutation,
  useWithdrawalsQuery,
  useRetryWithdrawalMutation,
  useMarkWithdrawalPaidMutation,
  useProvidersQuery,
  useVerifyProviderMutation,
  useShopOrdersQuery,
  useShopOrderQuery,
  useShopDisputesQuery,
  useRuleShopDisputeMutation,
  useProductsQuery,
  useSetProductVisibilityMutation,
  useSetProductSponsoredMutation,
  useSellersQuery,
  usePeopleQuery,
  usePersonQuery,
  useRevealPersonMutation,
  usePaymentsQuery,
  useWebhooksQuery,
  useReconciliationQuery,
  useSettingsQuery,
  useUpdateSettingsMutation,
  useStaffQuery,
  useGrantStaffMutation,
  useStaffActionMutation,
  useAuditQuery,
} = api;
