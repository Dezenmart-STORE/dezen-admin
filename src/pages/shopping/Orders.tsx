import { useParams } from 'react-router-dom';
import { errorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useShopOrderQuery, useShopOrdersQuery } from '../../store/api';
import { Table } from '../../components/Table';
import { PersonLink } from '../../components/PersonLink';
import { ListToolbar } from '../../components/ListToolbar';
import { RecordPage } from '../../components/RecordPage';
import { KeyValues, Money, PageHeader, Pagination, Status } from '../../components/ui';

/** Kept for older call sites: Shopping prices are in their token, shown in full. */
export const price = (amount: number, currency: string) => `${amount.toLocaleString('en-NG')} ${currency}`;

export function ShopOrders() {
  const list = useListParams();
  const { data, isLoading, isFetching, error } = useShopOrdersQuery(list.args);
  return (
    <>
      <PageHeader service="shopping" eyebrow="Shopping" title="Orders" description="Marketplace orders. The buyer's payment is held until they confirm delivery." />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Order, product, buyer or seller"
        statuses={[
          { value: '', label: 'All' },
          { value: 'disputed', label: 'Disputed' },
          { value: 'pending', label: 'Waiting for payment' },
          { value: 'accepted', label: 'Paid' },
          { value: 'shipped', label: 'Shipped' },
          { value: 'delivered', label: 'Delivered' },
          { value: 'completed', label: 'Completed' },
        ]}
        onChange={list.set}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={errorMessage(error)}
        rowKey={(o) => o.id}
        href={(o) => `/shopping/orders/${o.id}`}
        empty="No orders match."
        mobile={(o) => ({
          title: <span className="font-mono">{o.orderRef}</span>,
          subtitle: `${o.quantity} × ${o.product.name}`,
          amount: <Money amount={o.amount} currency={o.currency} />,
          status: <Status status={o.status} />,
        })}
        columns={[
          { header: 'Order', cell: (o) => <span className="font-mono">{o.orderRef}</span> },
          { header: 'Product', cell: (o) => `${o.quantity} × ${o.product.name}` },
          { header: 'Buyer', cell: (o) => o.buyer.name },
          { header: 'Seller', cell: (o) => o.seller.name },
          { header: 'Amount', align: 'right', cell: (o) => <Money amount={o.amount} currency={o.currency} /> },
          { header: 'Status', cell: (o) => <Status status={o.status} /> },
          { header: 'Placed', cell: (o) => <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(o.createdAt)}</span> },
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
      service="shopping"
      kind="Marketplace order"
      loading={isLoading}
      error={errorMessage(error)}
      title={<span className="font-mono">{o?.orderRef}</span>}
      badge={o && <Status status={o.status} />}
      timeline={o?.timeline}
      details={
        o && (
          <>
            <p className="mb-5 text-[17px]">
              <span className="font-mono text-ink-3">{o.quantity}×</span> {o.product.name}
            </p>
            <KeyValues
              rows={[
                ['Buyer', <PersonLink id={o.buyer.id} name={o.buyer.name} />],
                ['Seller', <PersonLink id={o.seller.id} name={o.seller.name} />],
                ['Amount', <Money amount={o.amount} currency={o.currency} />],
                ['Payment', o.held ? 'Held until the buyer confirms delivery' : 'Not held'],
                ['Placed', formatDate(o.createdAt)],
              ]}
            />
          </>
        )
      }
    />
  );
}
