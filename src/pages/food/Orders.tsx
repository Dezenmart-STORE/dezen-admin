import { errorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useFoodOrdersQuery } from '../../store/api';
import type { FoodOrder } from '../../store/types';
import { Table } from '../../components/Table';
import { ListToolbar } from '../../components/ListToolbar';
import { Money, PageHeader, Pagination, Status } from '../../components/ui';

/** What the money on an order is doing, as one status. A failure wins. */
export const moneyStatus = (o: FoodOrder) => {
  if (o.refund?.status === 'failed') return <Status status="failed" word="Refund failed" />;
  if (o.payout?.status === 'failed') return <Status status="failed" word="Payout failed" />;
  if (o.refund) return <Status status={o.refund.status} word={o.refund.status === 'paid' ? 'Refunded' : 'Refund sending'} />;
  if (o.payout) return <Status status={o.payout.status} word={o.payout.status === 'paid' ? 'Vendor paid' : 'Payout sending'} />;
  return <span className="text-ink-3">—</span>;
};

export function FoodOrders() {
  const list = useListParams();
  const { data, isLoading, isFetching, error } = useFoodOrdersQuery(list.args);
  return (
    <>
      <PageHeader service="food" eyebrow="DezenFoods" title="Orders" description="Every food order. Open one for its full history and to act on it." />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Order, vendor or buyer"
        statuses={[
          { value: '', label: 'All' },
          { value: 'money_failed', label: 'Payment failed' },
          { value: 'disputed', label: 'Disputed' },
          { value: 'pending', label: 'Waiting for vendor' },
          { value: 'preparing', label: 'Preparing' },
          { value: 'delivered', label: 'Delivered' },
          { value: 'completed', label: 'Completed' },
          { value: 'cancelled', label: 'Cancelled' },
        ]}
        onChange={list.set}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={errorMessage(error)}
        rowKey={(o) => o.id}
        href={(o) => `/food/orders/${o.id}`}
        empty={list.status === 'money_failed' ? 'No food payments have failed.' : 'No orders match.'}
        settledWhenEmpty={list.status === 'money_failed'}
        mobile={(o) => ({
          title: <span className="font-mono">{o.orderRef}</span>,
          subtitle: `${o.vendor.name} · ${o.buyer.name}`,
          amount: <Money amount={o.total} />,
          status: o.payout?.status === 'failed' || o.refund?.status === 'failed' ? moneyStatus(o) : <Status status={o.status} />,
        })}
        columns={[
          { header: 'Order', cell: (o) => <span className="font-mono">{o.orderRef}</span> },
          { header: 'Vendor', cell: (o) => o.vendor.name },
          { header: 'Buyer', cell: (o) => o.buyer.name },
          { header: 'Total', align: 'right', cell: (o) => <Money amount={o.total} /> },
          { header: 'Status', cell: (o) => <Status status={o.status} /> },
          { header: 'Money', cell: moneyStatus },
          { header: 'Placed', cell: (o) => <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(o.createdAt)}</span> },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}
