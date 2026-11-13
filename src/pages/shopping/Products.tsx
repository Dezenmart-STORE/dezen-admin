import { useState } from 'react';
import { errorMessage, failureOf } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useCan } from '../../store';
import { useProductsQuery, useSellersQuery, useSetProductSponsoredMutation, useSetProductVisibilityMutation } from '../../store/api';
import type { Product } from '../../store/types';
import { Table } from '../../components/Table';
import { ListToolbar } from '../../components/ListToolbar';
import { ConfirmDialog } from '../../components/Dialog';
import { Badge, Button, PageHeader, Pagination } from '../../components/ui';
import { price } from './Orders';

export function Products() {
  const can = useCan();
  const list = useListParams();
  const { data, isLoading, isFetching, error } = useProductsQuery(list.args);
  const [setVisible] = useSetProductVisibilityMutation();
  const [setSponsored, sponsoring] = useSetProductSponsoredMutation();
  const [acting, setActing] = useState<{ p: Product; show: boolean } | null>(null);
  const mayModerate = can('verify', 'shopping');

  return (
    <>
      <PageHeader title="Products" description="What sellers list on the marketplace." />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Search by product or seller"
        statuses={[
          { value: '', label: 'All products' },
          { value: 'reported', label: 'Reported by buyers' },
          { value: 'hidden', label: 'Hidden' },
        ]}
        onChange={list.set}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(p) => p.id}
        empty="No products match."
        columns={[
          {
            header: 'Product',
            cell: (p) => (
              <>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted">
                  {p.category} · {p.seller.name}
                </p>
              </>
            ),
          },
          { header: 'Price', cell: (p) => price(p.price, p.currency), className: 'whitespace-nowrap text-right' },
          { header: 'In stock', cell: (p) => p.stock, className: 'text-right' },
          {
            header: 'Shown',
            cell: (p) => (
              <div className="flex flex-wrap gap-1">
                {p.visible ? <Badge tone="ok">Visible</Badge> : <Badge tone="bad">Hidden</Badge>}
                {p.reports > 0 && <Badge tone="warn">{p.reports} reports</Badge>}
                {p.sponsored && <Badge tone="info">Sponsored</Badge>}
              </div>
            ),
          },
          { header: 'Listed', cell: (p) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(p.createdAt)}</span> },
          {
            header: '',
            cell: (p) =>
              mayModerate && (
                <div className="flex flex-wrap justify-end gap-2">
                  {p.visible ? (
                    <Button variant="danger" onClick={() => setActing({ p, show: false })}>
                      Hide
                    </Button>
                  ) : (
                    <Button onClick={() => setActing({ p, show: true })}>Show again</Button>
                  )}
                  <Button variant="ghost" busy={sponsoring.isLoading && sponsoring.originalArgs?.id === p.id} onClick={() => setSponsored({ id: p.id, sponsored: !p.sponsored })}>
                    {p.sponsored ? 'Stop sponsoring' : 'Sponsor'}
                  </Button>
                </div>
              ),
          },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
      <ConfirmDialog
        open={!!acting}
        title={acting ? `${acting.show ? 'Show' : 'Hide'} ${acting.p.name}` : ''}
        summary={acting?.show ? 'Buyers can see and buy it again. Its reports are cleared.' : 'Buyers can no longer see or buy it. The seller is told the reason.'}
        actionLabel={acting?.show ? 'Show again' : 'Hide product'}
        askReason={!acting?.show}
        reasonHint="The seller sees this"
        danger={!acting?.show}
        onClose={() => setActing(null)}
        onConfirm={async (reason) => failureOf(await setVisible({ id: acting!.p.id, visible: acting!.show, reason }))}
      />
    </>
  );
}

export function Sellers() {
  const list = useListParams();
  const { data, isLoading, isFetching, error } = useSellersQuery(list.args);
  return (
    <>
      <PageHeader title="Sellers" description="People who sell on the marketplace." />
      <ListToolbar q={list.q} placeholder="Search by seller" onChange={list.set} />
      <Table
        rows={data?.items}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(s) => s.id}
        empty="No sellers match."
        columns={[
          {
            header: 'Seller',
            cell: (s) => (
              <>
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-muted">{s.email}</p>
              </>
            ),
          },
          { header: 'Products', cell: (s) => s.products, className: 'text-right' },
          { header: 'Orders completed', cell: (s) => s.ordersCompleted, className: 'text-right' },
          { header: 'Disputes', cell: (s) => (s.disputes ? <Badge tone="warn">{s.disputes}</Badge> : 0), className: 'text-right' },
          { header: 'Joined', cell: (s) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(s.joinedAt)}</span> },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}
