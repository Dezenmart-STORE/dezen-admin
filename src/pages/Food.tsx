import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../lib/errors';
import { formatDate, formatNaira, humanize } from '../lib/format';
import { useCan } from '../store';
import {
  useFoodDisputesQuery,
  useFoodOrdersQuery,
  useResolveDisputeMutation,
  useRetryMoneyMutation,
  useReviewVendorMutation,
  useVendorsQuery,
  type FoodOrder,
  type Vendor,
  type VendorStatus,
} from '../store/api';
import { Table } from '../components/Table';
import { ConfirmWithCode, Dialog } from '../components/Dialog';
import { Button, ErrorNote, Field, Input, PageHeader, Select, StatusBadge, Tabs } from '../components/ui';

type Tab = 'vendors' | 'orders' | 'disputes';

export function Food() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'vendors';
  return (
    <>
      <PageHeader title="DezenFoods" description="Vendors, orders and disputes." />
      <Tabs
        label="DezenFoods sections"
        value={tab}
        onChange={(t) => setParams({ tab: t })}
        options={[
          { value: 'vendors', label: 'Vendors' },
          { value: 'orders', label: 'Orders' },
          { value: 'disputes', label: 'Disputes' },
        ]}
      />
      {tab === 'vendors' && <Vendors />}
      {tab === 'orders' && <Orders />}
      {tab === 'disputes' && <Disputes />}
    </>
  );
}

const buyerName = (o: FoodOrder) => (typeof o.buyer === 'object' ? o.buyer?.name || o.buyer?.email : undefined) ?? '—';
const total = (o: FoodOrder) => o.totals?.total ?? o.amount;

// ── vendors ──────────────────────────────────────────────────────────────────

function Vendors() {
  const can = useCan();
  const [status, setStatus] = useState<VendorStatus>('pending');
  const { data, isLoading, error } = useVendorsQuery(status);
  const [acting, setActing] = useState<{ vendor: Vendor; to: Exclude<VendorStatus, 'pending'> } | null>(null);
  const mayVerify = can('verify', 'food');

  return (
    <>
      <div className="mb-4 w-48">
        <Select aria-label="Vendor status" value={status} onChange={(e) => setStatus(e.target.value as VendorStatus)}>
          <option value="pending">Waiting for review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </Select>
      </div>
      <Table
        rows={data}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(v) => v._id}
        empty="No vendors here."
        columns={[
          {
            header: 'Vendor',
            cell: (v) => (
              <>
                <p className="font-medium">{v.businessName}</p>
                <p className="text-xs text-muted">{v.user?.email}</p>
              </>
            ),
          },
          { header: 'Location', cell: (v) => [v.lga, v.state].filter(Boolean).join(', ') || '—' },
          {
            header: 'Pays out to',
            cell: (v) =>
              v.payoutAccount ? (
                <span className="text-xs">
                  {v.payoutAccount.bankName} · {v.payoutAccount.accountNumberMasked}
                  <br />
                  <span className="text-muted">{v.payoutAccount.accountName}</span>
                </span>
              ) : (
                '—'
              ),
          },
          { header: 'Status', cell: (v) => <StatusBadge status={v.status} /> },
          { header: 'Applied', cell: (v) => <span className="text-xs text-muted">{formatDate(v.createdAt)}</span> },
          {
            header: 'Actions',
            cell: (v) =>
              mayVerify ? (
                <div className="flex flex-wrap gap-2">
                  {v.status !== 'approved' && (
                    <Button onClick={() => setActing({ vendor: v, to: 'approved' })}>Approve</Button>
                  )}
                  {v.status === 'pending' && (
                    <Button variant="danger" onClick={() => setActing({ vendor: v, to: 'rejected' })}>
                      Reject
                    </Button>
                  )}
                  {v.status === 'approved' && (
                    <Button variant="danger" onClick={() => setActing({ vendor: v, to: 'suspended' })}>
                      Suspend
                    </Button>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted">View only</span>
              ),
          },
        ]}
      />
      <ReviewVendor acting={acting} onClose={() => setActing(null)} />
    </>
  );
}

function ReviewVendor({
  acting,
  onClose,
}: {
  acting: { vendor: Vendor; to: Exclude<VendorStatus, 'pending'> } | null;
  onClose: () => void;
}) {
  const [review, { isLoading }] = useReviewVendorMutation();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const needsReason = acting?.to !== 'approved';
  const verb = { approved: 'Approve', rejected: 'Reject', suspended: 'Suspend' }[acting?.to ?? 'approved'];

  const submit = async () => {
    if (!acting) return;
    const res = await review({ id: acting.vendor._id, status: acting.to, reason: needsReason ? reason.trim() : undefined });
    if ('error' in res) return setError(errorMessage(res.error));
    setReason('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={!!acting} title={`${verb} ${acting?.vendor.businessName ?? ''}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {acting?.to === 'approved'
            ? 'The vendor can start selling on DezenFoods.'
            : acting?.to === 'suspended'
              ? 'The vendor’s menu is hidden until they are approved again.'
              : 'The vendor is told the reason and can apply again.'}
        </p>
        {needsReason && (
          <Field label="Reason" hint="The vendor sees this">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
        )}
        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={needsReason ? 'danger' : 'primary'}
            busy={isLoading}
            disabled={needsReason && reason.trim().length < 3}
            onClick={submit}
          >
            {verb}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ── orders ───────────────────────────────────────────────────────────────────

function Orders() {
  const can = useCan();
  const [status, setStatus] = useState('');
  const { data, isLoading, error } = useFoodOrdersQuery(status || undefined);
  const [retry] = useRetryMoneyMutation();
  const [target, setTarget] = useState<FoodOrder | null>(null);
  const failedMoney = (o: FoodOrder) => o.payout?.status === 'failed' || o.refund?.status === 'failed';

  return (
    <>
      <div className="mb-4 w-48">
        <Select aria-label="Order status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All orders</option>
          {['pending', 'accepted', 'preparing', 'ready', 'delivered', 'completed', 'disputed', 'cancelled', 'refunded'].map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </div>
      <Table
        rows={data}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(o) => o._id}
        empty="No orders here."
        columns={[
          { header: 'Order', cell: (o) => <span className="font-mono text-xs">{o.orderId}</span> },
          { header: 'Vendor', cell: (o) => o.vendor?.businessName ?? '—' },
          { header: 'Buyer', cell: buyerName },
          { header: 'Total', cell: (o) => formatNaira(total(o)), className: 'whitespace-nowrap' },
          { header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
          {
            header: 'Payments',
            cell: (o) => (
              <div className="space-y-1 text-xs">
                {o.payout && <p>Vendor payout: {humanize(o.payout.status)}</p>}
                {o.refund && <p>Buyer refund: {humanize(o.refund.status)}</p>}
                {!o.payout && !o.refund && <span className="text-muted">—</span>}
              </div>
            ),
          },
          { header: 'Placed', cell: (o) => <span className="text-xs text-muted">{formatDate(o.createdAt)}</span> },
          {
            header: 'Actions',
            cell: (o) =>
              failedMoney(o) && can('move_money', 'food') ? <Button onClick={() => setTarget(o)}>Try payment again</Button> : null,
          },
        ]}
      />
      <ConfirmWithCode
        open={!!target}
        title="Try the payment again"
        summary={
          target && (
            <>
              Order <span className="font-mono">{target.orderId}</span>:{' '}
              {target.refund?.status === 'failed'
                ? `refund the buyer ${formatNaira(target.refund.amount ?? total(target))}.`
                : `pay ${target.vendor?.businessName ?? 'the vendor'}.`}{' '}
              It is safe to repeat: money already sent is not sent twice.
            </>
          )
        }
        actionLabel="Send payment"
        onClose={() => setTarget(null)}
        onConfirm={async ({ code }) => {
          const res = await retry({ id: target!._id, code });
          return 'error' in res ? errorMessage(res.error) : null;
        }}
      />
    </>
  );
}

// ── disputes ─────────────────────────────────────────────────────────────────

function Disputes() {
  const can = useCan();
  const { data, isLoading, error } = useFoodDisputesQuery();
  const [resolve] = useResolveDisputeMutation();
  const [ruling, setRuling] = useState<{ order: FoodOrder; resolution: 'release_to_vendor' | 'refund_buyer' } | null>(null);
  const mayRule = can('move_money', 'food');

  return (
    <>
      <Table
        rows={data}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(o) => o._id}
        empty="No open disputes."
        columns={[
          { header: 'Order', cell: (o) => <span className="font-mono text-xs">{o.orderId}</span> },
          { header: 'Vendor', cell: (o) => o.vendor?.businessName ?? '—' },
          { header: 'Buyer', cell: buyerName },
          { header: 'Total', cell: (o) => formatNaira(total(o)), className: 'whitespace-nowrap' },
          { header: 'What the buyer said', cell: (o) => <span className="text-sm">{o.dispute?.reason ?? '—'}</span> },
          { header: 'Opened', cell: (o) => <span className="text-xs text-muted">{formatDate(o.dispute?.raisedAt ?? o.createdAt)}</span> },
          {
            header: 'Ruling',
            cell: (o) =>
              mayRule ? (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setRuling({ order: o, resolution: 'refund_buyer' })}>
                    Refund buyer {formatNaira(total(o))}
                  </Button>
                  <Button onClick={() => setRuling({ order: o, resolution: 'release_to_vendor' })}>Pay vendor</Button>
                </div>
              ) : (
                <span className="text-xs text-muted">View only</span>
              ),
          },
        ]}
      />
      <ConfirmWithCode
        open={!!ruling}
        title={ruling?.resolution === 'refund_buyer' ? 'Refund the buyer' : 'Pay the vendor'}
        summary={
          ruling && (
            <>
              Order <span className="font-mono">{ruling.order.orderId}</span>.{' '}
              {ruling.resolution === 'refund_buyer'
                ? `The buyer gets ${formatNaira(total(ruling.order))} back and the vendor is not paid.`
                : `${ruling.order.vendor?.businessName ?? 'The vendor'} is paid for this order and the buyer gets nothing back.`}{' '}
              This cannot be undone.
            </>
          )
        }
        amount={ruling?.resolution === 'refund_buyer' ? total(ruling.order) : undefined}
        askReason
        danger
        actionLabel={ruling?.resolution === 'refund_buyer' ? 'Refund buyer' : 'Pay vendor'}
        onClose={() => setRuling(null)}
        onConfirm={async ({ code, reason }) => {
          const res = await resolve({ orderId: ruling!.order._id, resolution: ruling!.resolution, note: reason, code });
          return 'error' in res ? errorMessage(res.error) : null;
        }}
      />
    </>
  );
}
