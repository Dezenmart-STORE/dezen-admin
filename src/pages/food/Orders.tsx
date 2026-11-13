import { Link } from 'react-router-dom';
import { errorMessage } from '../../lib/errors';
import { formatDate, formatNaira } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useFoodOrdersQuery } from '../../store/api';
import type { FoodOrder } from '../../store/types';
import { Table } from '../../components/Table';
import { ListToolbar } from '../../components/ListToolbar';
import { Badge, PageHeader, Pagination, StatusBadge } from '../../components/ui';

export const moneyNote = (o: FoodOrder) => {
  if (o.refund?.status === 'failed') return <Badge tone="bad">Refund failed</Badge>;
  if (o.payout?.status === 'failed') return <Badge tone="bad">Vendor payout failed</Badge>;
  if (o.refund) return <span className="text-xs text-muted">Refund {o.refund.status}</span>;
  if (o.payout) return <span className="text-xs text-muted">Vendor {o.payout.status}</span>;
  return null;
};

export function FoodOrders() {
  const list = useListParams();
  const { data, isLoading, isFetching, error } = useFoodOrdersQuery(list.args);
  return (
    <>
      <PageHeader title="Food orders" description="Every DezenFoods order. Open one to see its full history and act on it." />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Search by order, vendor or buyer"
        statuses={[
          { value: '', label: 'All orders' },
          { value: 'money_failed', label: 'Payment failed' },
          { value: 'pending', label: 'Waiting for vendor' },
          { value: 'preparing', label: 'Preparing' },
          { value: 'delivered', label: 'Delivered' },
          { value: 'completed', label: 'Completed' },
          { value: 'disputed', label: 'Disputed' },
          { value: 'cancelled', label: 'Cancelled' },
        ]}
        onChange={list.set}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(o) => o.id}
        empty="No orders match."
        columns={[
          {
            header: 'Order',
            cell: (o) => (
              <Link to={`/food/orders/${o.id}`} className="font-mono text-sm text-info hover:underline">
                {o.orderRef}
              </Link>
            ),
          },
          { header: 'Vendor', cell: (o) => o.vendor.name },
          { header: 'Buyer', cell: (o) => o.buyer.name },
          { header: 'Total', cell: (o) => formatNaira(o.total), className: 'whitespace-nowrap text-right' },
          { header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
          { header: 'Money', cell: moneyNote },
          { header: 'Placed', cell: (o) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(o.createdAt)}</span> },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}
