import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage, failureOf } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useCan } from '../../store';
import { useRuleShopDisputeMutation, useShopDisputesQuery } from '../../store/api';
import type { ShopDispute } from '../../store/types';
import { Table } from '../../components/Table';
import { ConfirmWithCode } from '../../components/Dialog';
import { Badge, Button, InfoNote, PageHeader, Pagination } from '../../components/ui';
import { price } from './Orders';

type Resolution = 'refund_buyer' | 'release_to_seller';

/**
 * Staff decide; an owner carries the decision out. Paying a Shopping seller or refunding a buyer
 * moves money held by the payment contract, which only the owner's separate key may do.
 */
export function ShopDisputes() {
  const can = useCan();
  const list = useListParams();
  const { data, isLoading, isFetching, error } = useShopDisputesQuery(list.args);
  const [rule] = useRuleShopDisputeMutation();
  const [acting, setActing] = useState<{ d: ShopDispute; resolution: Resolution } | null>(null);

  return (
    <>
      <PageHeader title="Shopping disputes" description="Orders a buyer or seller has disputed." />
      <div className="mb-4">
        <InfoNote>A ruling made here waits for an owner to carry it out. The buyer and seller are told once it is done.</InfoNote>
      </div>
      <Table
        rows={data?.items}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(d) => d.id}
        empty="No open disputes."
        columns={[
          {
            header: 'Order',
            cell: (d) => (
              <Link to={`/shopping/orders/${d.order.id}`} className="font-mono text-sm text-info hover:underline">
                {d.order.orderRef}
              </Link>
            ),
          },
          {
            header: 'What happened',
            cell: (d) => (
              <>
                <p className="text-sm">“{d.reason}”</p>
                <p className="text-xs text-muted">Opened by the {d.openedBy} · {formatDate(d.openedAt)}</p>
              </>
            ),
          },
          { header: 'Buyer', cell: (d) => d.order.buyer.name },
          { header: 'Seller', cell: (d) => d.order.seller.name },
          { header: 'At stake', cell: (d) => price(d.order.amount, d.order.currency), className: 'whitespace-nowrap text-right' },
          {
            header: 'Ruling',
            cell: (d) =>
              d.ruling ? (
                <>
                  <Badge tone="warn">{d.ruling.resolution === 'refund_buyer' ? 'Refund buyer' : 'Release payment to seller'}</Badge>
                  <p className="mt-1 text-xs text-muted">
                    By {d.ruling.by} · waiting for an owner to carry it out
                  </p>
                </>
              ) : can('move_money', 'shopping') ? (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setActing({ d, resolution: 'refund_buyer' })}>Refund buyer</Button>
                  <Button onClick={() => setActing({ d, resolution: 'release_to_seller' })}>Release payment to seller</Button>
                </div>
              ) : (
                <span className="text-xs text-muted">No ruling yet</span>
              ),
          },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
      <ConfirmWithCode
        open={!!acting}
        title={acting?.resolution === 'refund_buyer' ? 'Rule: refund the buyer' : 'Rule: release payment to the seller'}
        summary={
          acting &&
          (acting.resolution === 'refund_buyer'
            ? `${acting.d.order.buyer.name} gets ${price(acting.d.order.amount, acting.d.order.currency)} back. An owner carries this out.`
            : `${acting.d.order.seller.name} is paid ${price(acting.d.order.amount, acting.d.order.currency)}. An owner carries this out.`)
        }
        askReason
        danger
        actionLabel="Make ruling"
        onClose={() => setActing(null)}
        onConfirm={async ({ code, reason }) => failureOf(await rule({ id: acting!.d.id, resolution: acting!.resolution, code, reason }))}
      />
    </>
  );
}
