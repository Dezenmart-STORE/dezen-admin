import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage, failureOf } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useCan } from '../../store';
import { useProductCategoriesQuery, useProductsQuery, useSellersQuery, useSetProductSponsoredMutation, useSetProductVisibilityMutation } from '../../store/api';
import type { Product } from '../../store/types';
import { Table } from '../../components/Table';
import { ListToolbar } from '../../components/ListToolbar';
import { ConfirmDialog } from '../../components/Dialog';
import { Button, Money, PageHeader, Pagination, Select, Status, Tag } from '../../components/ui';
import { QueueTop, Waited } from '../../components/NextCard';
import { REMOVAL } from './ProductReview';

/** Each view's own order, said the way staff would, used when they have not picked one. */
const DEFAULT_ORDER: Record<string, string> = {
  reported: 'Waiting longest',
  review: 'Oldest first',
  removed: 'Newest removed',
  hidden: 'Newest listed',
  '': 'Newest listed',
};
const SORTS: { value: string; label: string; only?: string }[] = [
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest listed' },
  { value: 'oldest', label: 'Oldest listed' },
  { value: 'stock_desc', label: 'Most in stock' },
  { value: 'stock_asc', label: 'Fewest in stock' },
  { value: 'most_reported', label: 'Most reports', only: 'reported' },
];

export function Products() {
  const can = useCan();
  const list = useListParams({ status: 'reported' }, ['category', 'sort'] as const);
  const { data, isLoading, isFetching, error } = useProductsQuery(list.args);
  const categories = useProductCategoriesQuery({ status: list.status || undefined });
  const { category, sort } = list.extra;
  // A category that has no listings in this view is still offered, so the choice never silently vanishes.
  const categoryOptions = [...(categories.data ?? [])];
  if (category && !categoryOptions.some((c) => c.name === category)) categoryOptions.push({ name: category, count: 0 });
  const [setVisible] = useSetProductVisibilityMutation();
  const [setSponsored, sponsoring] = useSetProductSponsoredMutation();
  const [acting, setActing] = useState<{ p: Product; show: false } | null>(null);
  const navigate = useNavigate();
  const mayModerate = can('verify', 'shopping');

  const shown = (p: Product) => (
    <span className="flex flex-wrap items-center gap-2">
      {p.removed ? <Status status="cancelled" word="Removed" /> : p.visible ? <Status status="approved" word="Visible" /> : <Status status="cancelled" word={p.fixedAt ? 'Hidden · seller fixed it' : 'Hidden'} />}
      {!p.removed && p.changedAt && p.needsLook && p.visible && <Tag tone="waiting">Changed since looked over</Tag>}
      {p.sponsored && <Tag>Sponsored</Tag>}
    </span>
  );
  const removedView = list.status === 'removed';
  // Clearing a report or putting a listing back on sale only happens on the listing page, after the checks.
  // The row keeps what needs no checks: hiding, and sponsoring something already cleared.
  const actions = (p: Product) =>
    mayModerate &&
    !p.removed && (
      // Stacked, so the buttons never squeeze the product column.
      <div className="flex flex-col items-stretch gap-1.5" onClick={(e) => e.stopPropagation()}>
        {p.needsLook && (
          <Button size="sm" variant="primary" onClick={() => navigate(`/shopping/products/${p.id}`)}>
            Look it over
          </Button>
        )}
        {p.visible && (
          <Button size="sm" variant="danger" onClick={() => setActing({ p, show: false })}>
            Hide
          </Button>
        )}
        {p.visible && !p.needsLook && (
          <Button size="sm" variant="quiet" busy={sponsoring.isLoading && sponsoring.originalArgs?.id === p.id} onClick={() => setSponsored({ id: p.id, sponsored: !p.sponsored })}>
            {p.sponsored ? 'Stop sponsoring' : 'Sponsor'}
          </Button>
        )}
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
          description="Read what buyers said, then open the listing to keep it, hide it or remove it. Keeping it means ticking every check."
          clear={['No products have been reported.', 'Nothing buyers flagged is still for sale.']}
        />
      ) : (
        <PageHeader
          service="shopping"
          eyebrow="Shopping"
          title="Products"
          description={
            list.status === 'review'
              ? 'Listings no one has looked over yet, ones the seller changed since, and hidden ones the seller says are fixed.'
              : removedView
                ? 'Listings taken off Dezenmart for good, with the notice each seller got.'
                : 'What sellers list on the marketplace. Open any listing to look it over.'
          }
        />
      )}
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Product or seller"
        statuses={[
          { value: 'reported', label: 'Reported' },
          { value: 'review', label: 'To review' },
          { value: '', label: 'All' },
          { value: 'hidden', label: 'Hidden' },
          { value: 'removed', label: 'Removed' },
        ]}
        onChange={(c) => list.set(c.status !== undefined && sort === 'most_reported' && c.status !== 'reported' ? { ...c, sort: '' } : c)}
      >
        <Select aria-label="Category" value={category} onChange={(e) => list.set({ category: e.target.value })} className="h-10 sm:w-52 sm:shrink-0">
          <option value="">All categories</option>
          {categoryOptions.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} ({c.count})
            </option>
          ))}
        </Select>
        <Select aria-label="Order" value={sort} onChange={(e) => list.set({ sort: e.target.value })} className="h-10 sm:w-52 sm:shrink-0">
          <option value="">{DEFAULT_ORDER[list.status] ?? 'Newest listed'}</option>
          {SORTS.filter((o) => !o.only || o.only === list.status).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </ListToolbar>
      {(category || sort) && (
        <p className="-mt-2 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
          {data && (
            <span>
              {data.total} {data.total === 1 ? 'listing' : 'listings'}
              {category && ` in ${category}`}
              {sort && `, ${SORTS.find((o) => o.value === sort)?.label.toLowerCase() ?? ''}`}
            </span>
          )}
          <button type="button" onClick={() => list.set({ category: '', sort: '' })} className="cursor-pointer font-semibold text-ink underline-offset-4 hover:underline">
            Clear
          </button>
        </p>
      )}
      <Table
        sort={sort}
        onSort={(s) => list.set({ sort: s })}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={errorMessage(error)}
        rowKey={(p) => p.id}
        href={(p) => `/shopping/products/${p.id}`}
        empty={
          list.status === 'reported'
            ? 'No products have been reported.'
            : list.status === 'review'
              ? 'Every listing has been looked over.'
              : removedView
                ? 'No listings have been removed.'
                : 'No products match.'
        }
        // A filter that finds nothing is not a cleared queue.
        settledWhenEmpty={!category && !list.q && (list.status === 'reported' || list.status === 'review')}
        mobile={(p) => ({
          title: p.name,
          subtitle: p.removed ? `${p.seller.name} · ${REMOVAL[p.removed.reason].label}` : `${p.seller.name} · ${p.category}`,
          amount: <Money amount={p.price} currency={p.currency} ngn={p.priceNgn} />,
          status: shown(p),
        })}
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
          { header: 'Price', align: 'right', sort: ['price_asc', 'price_desc'], cell: (p) => <Money amount={p.price} currency={p.currency} ngn={p.priceNgn} /> },
          ...(removedView
            ? [
                { header: 'Why', cell: (p: Product) => <span className="text-[13.5px]">{p.removed ? REMOVAL[p.removed.reason].label : ''}</span> },
                {
                  header: 'Removed',
                  cell: (p: Product) => (
                    <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">
                      {p.removed && formatDate(p.removed.at)}
                    </span>
                  ),
                },
              ]
            : [
                { header: 'In stock', align: 'right' as const, sort: ['stock_asc', 'stock_desc'] as [string, string], cell: (p: Product) => <span className="font-mono">{p.stock}</span> },
                { header: 'Shown', cell: shown },
                list.status === 'reported'
                  ? { header: 'Waiting', align: 'right' as const, cell: (p: Product) => <Waited since={[...(p.reportNotes ?? []).map((n) => n.at)].sort()[0] ?? p.createdAt} promiseHours={48} /> }
                  : { header: 'Listed', sort: ['oldest', 'newest'] as [string, string], cell: (p: Product) => <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(p.createdAt)}</span> },
                { header: '', cell: actions },
              ]),
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
      <ConfirmDialog
        open={!!acting}
        title={acting ? `Hide ${acting.p.name}` : ''}
        summary="Buyers can no longer see or buy it. The seller is told the reason and can fix it; it comes back to “To review” before it goes on sale again."
        actionLabel="Hide this product"
        askReason
        reasonHint="The seller sees this, so say what to fix."
        danger
        onClose={() => setActing(null)}
        onConfirm={async (reason) => failureOf(await setVisible({ id: acting!.p.id, visible: false, reason }))}
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
