import { useState } from 'react';
import { errorMessage, failureOf } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useCan } from '../../store';
import { useKeepProductMutation, useProductsQuery, useSellersQuery, useSetProductSponsoredMutation, useSetProductVisibilityMutation } from '../../store/api';
import type { Product } from '../../store/types';
import { Table } from '../../components/Table';
import { ListToolbar } from '../../components/ListToolbar';
import { ConfirmDialog } from '../../components/Dialog';
import { Button, Money, PageHeader, Pagination, Status, Tag } from '../../components/ui';
import { QueueTop, Waited } from '../../components/NextCard';

export function Products() {
  const can = useCan();
  const list = useListParams({ status: 'reported' });
  const { data, isLoading, isFetching, error } = useProductsQuery(list.args);
  const [setVisible] = useSetProductVisibilityMutation();
  const [setSponsored, sponsoring] = useSetProductSponsoredMutation();
  const [acting, setActing] = useState<{ p: Product; show: boolean } | null>(null);
  const [keeping, setKeeping] = useState<Product | null>(null);
  const [keep] = useKeepProductMutation();
  const mayModerate = can('verify', 'shopping');

  const shown = (p: Product) => (
    <span className="flex flex-wrap items-center gap-2">
      {p.visible ? <Status status="approved" word="Visible" /> : <Status status="cancelled" word="Hidden" />}
      {p.sponsored && <Tag>Sponsored</Tag>}
    </span>
  );
  const actions = (p: Product) =>
    mayModerate && (
      // Stacked, so three buttons never squeeze the product column.
      <div className="flex flex-col items-stretch gap-1.5">
        {p.visible && p.reports > 0 && (
          <Button size="sm" onClick={() => setKeeping(p)}>
            Keep it
          </Button>
        )}
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
      {list.status === 'reported' ? (
        <QueueTop
          queue="products"
          service="shopping"
          eyebrow="Shopping"
          title="Products"
          who={['product', 'products']}
          waitFor="for a look"
          description="Read what buyers said, then hide the product or keep it. Hiding tells the seller why."
          clear={['No products have been reported.', 'Nothing buyers flagged is still for sale.']}
        />
      ) : (
        <PageHeader service="shopping" eyebrow="Shopping" title="Products" description="What sellers list on the marketplace." />
      )}
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Product or seller"
        statuses={[
          { value: 'reported', label: 'Reported' },
          { value: '', label: 'All' },
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
        mobile={(p) => ({ title: p.name, subtitle: `${p.seller.name} · ${p.category}`, amount: <Money amount={p.price} currency={p.currency} ngn={p.priceNgn} />, status: shown(p) })}
        columns={[
          {
            header: 'Product',
            // The product and what buyers said is what staff read: it keeps its width and the rest gives way.
            className: 'min-w-[18rem]',
            cell: (p) => (
              <>
                <p className="font-semibold">{p.name}</p>
                <p className="text-[12.5px] text-ink-3">
                  {p.category} · {p.seller.name}
                </p>
                {p.reports > 0 && (
                  <div className="mt-2 max-w-[48ch] space-y-1 border-l-2 border-need/50 pl-3">
                    <p className="text-[12px] font-semibold text-need">
                      {p.reports} {p.reports === 1 ? 'buyer reported this' : 'buyers reported this'}
                    </p>
                    {p.reportNotes?.slice(0, 2).map((n) => (
                      <p key={n.at} className="text-[13px] text-ink-2">
                        “{n.text}”
                      </p>
                    ))}
                    {(p.reportNotes?.length ?? 0) > 2 && <p className="text-[12px] text-ink-3">and {p.reportNotes!.length - 2} more</p>}
                  </div>
                )}
              </>
            ),
          },
          { header: 'Price', align: 'right', cell: (p) => <Money amount={p.price} currency={p.currency} ngn={p.priceNgn} /> },
          { header: 'In stock', align: 'right', cell: (p) => <span className="font-mono">{p.stock}</span> },
          { header: 'Shown', cell: shown },
          list.status === 'reported'
            ? { header: 'Waiting', align: 'right', cell: (p) => <Waited since={[...(p.reportNotes ?? []).map((n) => n.at)].sort()[0] ?? p.createdAt} promiseHours={48} /> }
            : { header: 'Listed', cell: (p) => <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(p.createdAt)}</span> },
          { header: '', cell: actions },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
      <ConfirmDialog
        open={!!keeping}
        title={keeping ? `Keep ${keeping.name} on sale` : ''}
        summary="Its reports are cleared and it leaves this list. Buyers who reported it are not told."
        actionLabel="Keep it on sale"
        askReason
        reasonHint="Why the reports did not hold up. Only staff see this."
        onClose={() => setKeeping(null)}
        onConfirm={async (reason) => failureOf(await keep({ id: keeping!.id, reason: reason ?? '' }))}
      />
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
          status: s.disputes ? <span className="text-[12.5px] text-ink-2">{s.disputes} {s.disputes === 1 ? "dispute" : "disputes"}</span> : undefined,
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
          { header: 'Disputes', align: 'right', cell: (s) => <span className={`font-mono ${s.disputes ? "font-semibold" : "text-ink-3"}`}>{s.disputes}</span> },
          { header: 'Joined', cell: (s) => <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(s.joinedAt)}</span> },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}
