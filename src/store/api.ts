import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { API_URL } from '../lib/config';
import { signedOut, type Access } from './session';

type State = { session: { googleToken: string | null; staffToken: string | null } };
/** 'google' for the three sign-in calls; everything else uses the staff token. */
type Extra = { auth?: 'google' };

const raw = (token: 'google' | 'staff') =>
  fetchBaseQuery({
    baseUrl: API_URL,
    prepareHeaders: (headers, { getState }) => {
      const s = (getState() as State).session;
      const t = token === 'google' ? s.googleToken : s.staffToken;
      if (t) headers.set('Authorization', `Bearer ${t}`);
      return headers;
    },
  });
const withGoogle = raw('google');
const withStaff = raw('staff');

/** A 401 that means the staff session is over (not a wrong authenticator code) signs out. */
const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError, Extra> = async (args, api, extra) => {
  const result = await (extra?.auth === 'google' ? withGoogle : withStaff)(args, api, extra ?? {});
  const message = (result.error?.data as { message?: string } | undefined)?.message ?? '';
  if (result.error?.status === 401 && extra?.auth !== 'google' && /session has ended|sign-in required/i.test(message)) {
    api.dispatch(signedOut());
  }
  return result;
};

/** The authenticator code for money and staff changes travels in a header, never in the body. */
const withCode = (code: string) => ({ 'X-Admin-Code': code });

export interface Envelope<T> {
  status: string;
  data: T;
}

export type VendorStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface Vendor {
  _id: string;
  businessName: string;
  status: VendorStatus;
  phone?: string;
  state?: string;
  lga?: string;
  address?: string;
  rejectionReason?: string;
  user?: { name?: string; email?: string };
  payoutAccount?: { bankName?: string; accountName?: string; accountNumberMasked?: string };
  createdAt: string;
}

export interface FoodOrder {
  _id: string;
  orderId: string;
  status: string;
  buyer?: { name?: string; email?: string } | string;
  vendor?: { businessName?: string };
  totals?: { subtotal?: number; deliveryFee?: number; serviceFee?: number; total?: number };
  amount?: number;
  fulfilment?: string;
  dispute?: { reason?: string; raisedAt?: string; resolved?: boolean };
  refund?: { status: string; amount?: number };
  payout?: { status: string };
  createdAt: string;
}

export interface Rider {
  id: string;
  name: string;
  email: string;
  phone: string;
  vehicleType?: string;
  vehiclePlateNumber?: string;
  driverLicenseNumber?: string;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  availabilityStatus?: string;
  payoutAccount?: { bankName?: string; accountName?: string; accountNumberMasked?: string };
  createdAt?: string;
}

export interface StaffMember {
  id: string;
  user: { id: string; email: string; name?: string } | string;
  capabilities: string[];
  services: string[];
  totpEnabled: boolean;
  disabled: boolean;
  lastSignInAt?: string;
  createdAt: string;
}

export interface StaffOverview {
  staff: StaffMember[];
  presets: Record<string, string[]>;
  capabilities: string[];
  services: string[];
}

export interface AuditEvent {
  _id: string;
  staffEmail?: string;
  capability?: string;
  service?: string;
  action: string;
  target?: Record<string, unknown>;
  input?: Record<string, unknown>;
  reason?: string;
  statusCode: number;
  ip?: string;
  requestId: string;
  createdAt: string;
}

export interface UserRecord {
  _id: string;
  name?: string;
  email: string;
  phoneNumber?: string;
  address?: string;
  bankName?: string;
  bankAccount?: string;
  roles?: string[];
  isMerchant?: boolean;
  createdAt?: string;
}

export interface RiderPage {
  riders: Rider[];
  total: number;
  page: number;
  limit: number;
}

export interface Session {
  token: string;
  capabilities: string[];
  services: string[];
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Vendors', 'Orders', 'Riders', 'Staff', 'Audit'],
  endpoints: (b) => ({
    // ── sign-in ──
    setupAuthenticator: b.mutation<{ secret: string; otpauthUrl: string }, void>({
      query: () => ({ url: '/admin/auth/authenticator/setup', method: 'POST' }),
      extraOptions: { auth: 'google' },
      transformResponse: (r: Envelope<{ secret: string; otpauthUrl: string }>) => r.data,
    }),
    confirmAuthenticator: b.mutation<unknown, { code: string }>({
      query: (body) => ({ url: '/admin/auth/authenticator/confirm', method: 'POST', body }),
      extraOptions: { auth: 'google' },
    }),
    startSession: b.mutation<Session, { code: string }>({
      query: (body) => ({ url: '/admin/auth/session', method: 'POST', body }),
      extraOptions: { auth: 'google' },
      transformResponse: (r: Envelope<Session>) => r.data,
    }),
    me: b.query<Access, void>({
      query: () => '/admin/auth/me',
      transformResponse: (r: Envelope<Access>) => r.data,
    }),
    signOut: b.mutation<unknown, void>({
      query: () => ({ url: '/admin/auth/sign-out', method: 'POST' }),
    }),

    // ── DezenFoods ──
    vendors: b.query<Vendor[], VendorStatus | undefined>({
      query: (status) => ({ url: '/admin/food/vendors', params: status ? { status } : undefined }),
      providesTags: ['Vendors'],
      transformResponse: (r: Envelope<{ vendors: Vendor[] }>) => r.data.vendors,
    }),
    reviewVendor: b.mutation<unknown, { id: string; status: Exclude<VendorStatus, 'pending'>; reason?: string }>({
      query: ({ id, ...body }) => ({ url: `/admin/food/vendors/${id}/review`, method: 'POST', body }),
      invalidatesTags: ['Vendors', 'Audit'],
    }),
    foodOrders: b.query<FoodOrder[], string | undefined>({
      query: (status) => ({ url: '/admin/food/orders', params: status ? { status } : undefined }),
      providesTags: ['Orders'],
      transformResponse: (r: Envelope<{ orders: FoodOrder[] }>) => r.data.orders,
    }),
    foodDisputes: b.query<FoodOrder[], void>({
      query: () => '/admin/food/disputes',
      providesTags: ['Orders'],
      transformResponse: (r: Envelope<{ orders: FoodOrder[] }>) => r.data.orders,
    }),
    resolveDispute: b.mutation<
      unknown,
      { orderId: string; resolution: 'release_to_vendor' | 'refund_buyer'; note?: string; code: string }
    >({
      query: ({ orderId, code, ...body }) => ({
        url: `/admin/food/disputes/${orderId}/resolve`,
        method: 'POST',
        body,
        headers: withCode(code),
      }),
      invalidatesTags: ['Orders', 'Audit'],
    }),
    retryMoney: b.mutation<unknown, { id: string; code: string }>({
      query: ({ id, code }) => ({ url: `/admin/food/orders/${id}/retry-money`, method: 'POST', headers: withCode(code) }),
      invalidatesTags: ['Orders', 'Audit'],
    }),

    // ── DezenExpress ──
    riders: b.query<RiderPage, { status: string; page: number }>({
      query: ({ status, page }) => ({ url: '/admin/express/riders', params: { status, page, limit: 25 } }),
      providesTags: ['Riders'],
      transformResponse: (r: Envelope<RiderPage>) => r.data,
    }),
    verifyRider: b.mutation<unknown, { riderId: string; status: 'verified' | 'rejected' }>({
      query: ({ riderId, status }) => ({ url: `/admin/express/riders/${riderId}/verify`, method: 'PATCH', body: { status } }),
      invalidatesTags: ['Riders', 'Audit'],
    }),

    // ── staff ──
    staff: b.query<StaffOverview, void>({
      query: () => '/admin/staff',
      providesTags: ['Staff'],
      transformResponse: (r: Envelope<StaffOverview>) => r.data,
    }),
    grantStaff: b.mutation<unknown, { email: string; preset: string; services: string[]; code: string }>({
      query: ({ code, ...body }) => ({ url: '/admin/staff', method: 'POST', body, headers: withCode(code) }),
      invalidatesTags: ['Staff', 'Audit'],
    }),
    staffAction: b.mutation<unknown, { id: string; action: 'disable' | 'enable' | 'reset-authenticator'; code: string }>({
      query: ({ id, action, code }) => ({ url: `/admin/staff/${id}/${action}`, method: 'POST', headers: withCode(code) }),
      invalidatesTags: ['Staff', 'Audit'],
    }),

    // ── activity log ──
    audit: b.query<AuditEvent[], { service?: string; before?: string }>({
      query: ({ service, before }) => ({
        url: '/admin/audit',
        params: { limit: 50, ...(service ? { service } : {}), ...(before ? { before } : {}) },
      }),
      providesTags: ['Audit'],
      transformResponse: (r: Envelope<{ events: AuditEvent[] }>) => r.data.events,
    }),

    // ── users (full records; every view is logged) ──
    users: b.query<UserRecord[], number>({
      query: (page) => ({ url: '/admin/platform/users', params: { page, limit: 25 } }),
    }),
    user: b.query<UserRecord, string>({
      query: (id) => `/admin/platform/users/${id}`,
    }),
  }),
});

export const {
  useSetupAuthenticatorMutation,
  useConfirmAuthenticatorMutation,
  useStartSessionMutation,
  useMeQuery,
  useSignOutMutation,
  useVendorsQuery,
  useReviewVendorMutation,
  useFoodOrdersQuery,
  useFoodDisputesQuery,
  useResolveDisputeMutation,
  useRetryMoneyMutation,
  useRidersQuery,
  useVerifyRiderMutation,
  useStaffQuery,
  useGrantStaffMutation,
  useStaffActionMutation,
  useAuditQuery,
  useUsersQuery,
  useUserQuery,
} = api;
