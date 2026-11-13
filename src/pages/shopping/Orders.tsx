import { Link, useParams } from 'react-router-dom';
import { errorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useShopOrderQuery, useShopOrdersQuery } from '../../store/api';
import { Table } from '../../components/Table';
import { PersonLink } from '../../components/PersonLink';
import { ListToolbar } from '../../components/ListToolbar';
import { RecordPage } from '../../components/RecordPage';
import { KeyValues, PageHeader, Pagination, StatusBadge } from '../../components/ui';

export const price = (amount: number, currency: string) => `${amount.toLocaleString('en-NG')} ${currency}`;

export function ShopOrders() {
  const list = useListParams();
  const { data, isLoading, isFetching, error } = useShopOrdersQuery(list.args);
  return (
    <>
      <PageHeader title="Shopping orders" description="Marketplace orders. The buyer's payment is held until they confirm delivery." />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Search by order, product, buyer or seller"
        statuses={[
          { value: '', label: 'All orders' },
          { value: 'pending', label: 'Waiting for payment' },
          { value: 'accepted', label: 'Paid' },
          { value: 'shipped', label: 'Shipped' },
          { value: 'delivered', label: 'Delivered' },
          { value: 'completed', label: 'Completed' },
          { value: 'disputed', label: 'Disputed' },
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
              <Link to={`/shopping/orders/${o.id}`} className="font-mono text-sm text-info hover:underline">
                {o.orderRef}
              </Link>
            ),
          },
          { header: 'Product', cell: (o) => `${o.quantity} × ${o.product.name}` },
          { header: 'Buyer', cell: (o) => o.buyer.name },
          { header: 'Seller', cell: (o) => o.seller.name },
          { header: 'Amount', cell: (o) => price(o.amount, o.currency), className: 'whitespace-nowrap text-right' },
          { header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
          { header: 'Placed', cell: (o) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(o.createdAt)}</span> },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}

export function ShopOrderDetail() {
  const { id = '' } = useParams();
  const { data: o, isLoading, error } = useShopOrderQuery(id);
  return (
    <RecordPage
      back="/shopping/orders"
      backLabel="Shopping orders"
      loading={isLoading}
      error={errorMessage(error)}
      title={<span className="font-mono">{o?.orderRef}</span>}
      badge={o && <StatusBadge status={o.status} />}
      timeline={o?.timeline}
      details={
        o && (
          <KeyValues
            rows={[
              ['Product', `${o.quantity} × ${o.product.name}`],
              ['Buyer', <PersonLink id={o.buyer.id} name={o.buyer.name} />],
              ['Seller', <PersonLink id={o.seller.id} name={o.seller.name} />],
              ['Amount', price(o.amount, o.currency)],
              ['Payment', o.held ? 'Held until the buyer confirms delivery' : 'Not held'],
              ['Placed', formatDate(o.createdAt)],
            ]}
          />
        )
      }
    />
  );
}
