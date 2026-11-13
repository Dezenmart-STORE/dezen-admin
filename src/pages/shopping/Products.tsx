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
import { Button, Money, PageHeader, Pagination, Status, Tag } from '../../components/ui';

export function Products() {
  const can = useCan();
  const list = useListParams();
  const { data, isLoading, isFetching, error } = useProductsQuery(list.args);
  const [setVisible] = useSetProductVisibilityMutation();
  const [setSponsored, sponsoring] = useSetProductSponsoredMutation();
  const [acting, setActing] = useState<{ p: Product; show: boolean } | null>(null);
  const mayModerate = can('verify', 'shopping');

  const shown = (p: Product) => (
    <span className="flex flex-wrap items-center gap-2">
      {p.visible ? <Status status="approved" word="Visible" /> : <Status status="cancelled" word="Hidden" />}
      {p.reports > 0 && <Tag tone="need">{p.reports} reports</Tag>}
      {p.sponsored && <Tag>Sponsored</Tag>}
    </span>
  );
  const actions = (p: Product) =>
    mayModerate && (
      <div className="flex flex-wrap justify-end gap-2">
        {p.visible ? (
          <Button size="sm" variant="danger" onClick={() => setActing({ p, show: false })}>
            Hide
          </Button>
        ) : (
          <Button size="sm" onClick={() => setActing({ p, show: true })}>
            Show again
          </Button>
        )}
        <Button size="sm" variant="quiet" busy={sponsoring.isLoading && sponsoring.originalArgs?.id === p.id} onClick={() => setSponsored({ id: p.id, sponsored: !p.sponsored })}>
          {p.sponsored ? 'Stop sponsoring' : 'Sponsor'}
        </Button>
      </div>
    );

  return (
    <>
      <PageHeader service="shopping" eyebrow="Shopping" title="Products" description="What sellers list on the marketplace." />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Product or seller"
        statuses={[
          { value: '', label: 'All' },
          { value: 'reported', label: 'Reported' },
          { value: 'hidden', label: 'Hidden' },
        ]}
        onChange={list.set}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={errorMessage(error)}
        rowKey={(p) => p.id}
        empty={list.status === 'reported' ? 'No products have been reported.' : 'No products match.'}
        settledWhenEmpty={list.status === 'reported'}
        mobile={(p) => ({ title: p.name, subtitle: `${p.seller.name} · ${p.category}`, amount: <Money amount={p.price} currency={p.currency} />, status: shown(p) })}
        columns={[
          {
            header: 'Product',
            cell: (p) => (
              <>
                <p className="font-semibold">{p.name}</p>
                <p className="text-[12.5px] text-ink-3">
                  {p.category} · {p.seller.name}
                </p>
              </>
            ),
          },
          { header: 'Price', align: 'right', cell: (p) => <Money amount={p.price} currency={p.currency} /> },
          { header: 'In stock', align: 'right', cell: (p) => <span className="font-mono">{p.stock}</span> },
          { header: 'Shown', cell: shown },
          { header: 'Listed', cell: (p) => <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(p.createdAt)}</span> },
          { header: '', cell: actions },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
      <ConfirmDialog
        open={!!acting}
        title={acting ? `${acting.show ? 'Show' : 'Hide'} ${acting.p.name}` : ''}
        summary={acting?.show ? 'Buyers can see and buy it again, and its reports are cleared.' : 'Buyers can no longer see or buy it. The seller is told the reason.'}
        actionLabel={acting?.show ? 'Show it again' : 'Hide this product'}
        askReason={!acting?.show}
        reasonHint="The seller sees this."
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
      <PageHeader service="shopping" eyebrow="Shopping" title="Sellers" description="People who sell on the marketplace." />
      <ListToolbar q={list.q} placeholder="Seller" onChange={list.set} />
      <Table
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={errorMessage(error)}
        rowKey={(s) => s.id}
        empty="No sellers match."
        mobile={(s) => ({
          title: s.name,
          subtitle: `${s.products} products · ${s.ordersCompleted} orders`,
          status: s.disputes ? <Tag tone="need">{s.disputes} disputes</Tag> : undefined,
        })}
        columns={[
          {
            header: 'Seller',
            cell: (s) => (
              <>
                <p className="font-semibold">{s.name}</p>
                <p className="text-[12.5px] text-ink-3">{s.email}</p>
              </>
            ),
          },
          { header: 'Products', align: 'right', cell: (s) => <span className="font-mono">{s.products}</span> },
          { header: 'Orders completed', align: 'right', cell: (s) => <span className="font-mono">{s.ordersCompleted}</span> },
          { header: 'Disputes', align: 'right', cell: (s) => (s.disputes ? <Tag tone="need">{s.disputes}</Tag> : <span className="font-mono text-ink-3">0</span>) },
          { header: 'Joined', cell: (s) => <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(s.joinedAt)}</span> },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}
