import { useState } from 'react';
import { errorMessage, receiptOf } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useCan } from '../../store';
import { useRuleShopDisputeMutation, useShopDisputesQuery } from '../../store/api';
import type { ShopDispute } from '../../store/types';
import { Table } from '../../components/Table';
import { Dialog, MoneySheet } from '../../components/Dialog';
import { Choice, WHO } from '../../components/Choice';
import { Button, InfoNote, Money, PageHeader, Pagination, Status } from '../../components/ui';

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
  const [choosing, setChoosing] = useState<ShopDispute | null>(null);
  const [ruling, setRuling] = useState<{ d: ShopDispute; resolution: Resolution } | null>(null);

  const state = (d: ShopDispute) =>
    d.ruling ? (
      <span className="flex flex-col items-end gap-0.5 md:items-start">
        <Status status="pending" word={d.ruling.resolution === 'refund_buyer' ? 'Refund buyer · waiting for an owner' : 'Pay seller · waiting for an owner'} />
        <span className="text-[11.5px] text-ink-3">by {d.ruling.by}</span>
      </span>
    ) : can('move_money', 'shopping') ? (
      <Button size="sm" variant="primary" onClick={() => setChoosing(d)}>
        Make a ruling
      </Button>
    ) : (
      <span className="text-[12px] text-ink-3">{WHO.move_money} rule</span>
    );

  return (
    <>
      <PageHeader service="shopping" eyebrow="Shopping" title="Disputes" description="Orders a buyer or seller has disputed." />
      <div className="mb-5">
        <InfoNote>Your ruling is recorded straight away. An owner then carries it out, and the buyer and seller are told when it is done.</InfoNote>
      </div>
      <Table
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={errorMessage(error)}
        rowKey={(d) => d.id}
        empty="No Shopping disputes are open."
        settledWhenEmpty
        mobile={(d) => ({
          title: <span className="font-mono">{d.order.orderRef}</span>,
          subtitle: `“${d.reason}”`,
          amount: <Money amount={d.order.amount} currency={d.order.currency} />,
          status: state(d),
        })}
        columns={[
          { header: 'Order', cell: (d) => <span className="font-mono">{d.order.orderRef}</span> },
          {
            header: 'What happened',
            cell: (d) => (
              <>
                <p className="max-w-[40ch]">“{d.reason}”</p>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  Opened by the {d.openedBy} · {formatDate(d.openedAt)}
                </p>
              </>
            ),
          },
          { header: 'Buyer', cell: (d) => d.order.buyer.name },
          { header: 'Seller', cell: (d) => d.order.seller.name },
          { header: 'At stake', align: 'right', cell: (d) => <Money amount={d.order.amount} currency={d.order.currency} /> },
          { header: 'Ruling', cell: state },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}

      <Dialog open={!!choosing} title={choosing ? `Rule on ${choosing.order.orderRef}` : ''} eyebrow="Shopping · dispute" onClose={() => setChoosing(null)}>
        {choosing && (
          <div className="space-y-5">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">The {choosing.openedBy} says</p>
              <p className="mt-1.5 text-[17px] leading-snug">“{choosing.reason}”</p>
              <p className="mt-1.5 text-[13px] text-ink-3">
                {choosing.order.quantity} × {choosing.order.product.name} · {choosing.order.buyer.name} bought from {choosing.order.seller.name}
              </p>
            </div>
            <div className="grid gap-3">
              <Choice
                title="Refund the buyer"
                amount={choosing.order.amount}
                currency={choosing.order.currency}
                consequence={`${choosing.order.buyer.name} gets the payment back. ${choosing.order.seller.name} is not paid.`}
                onChoose={() => {
                  setRuling({ d: choosing, resolution: 'refund_buyer' });
                  setChoosing(null);
                }}
              />
              <Choice
                title="Release payment to the seller"
                amount={choosing.order.amount}
                currency={choosing.order.currency}
                consequence={`${choosing.order.seller.name} is paid. ${choosing.order.buyer.name} gets nothing back.`}
                onChoose={() => {
                  setRuling({ d: choosing, resolution: 'release_to_seller' });
                  setChoosing(null);
                }}
              />
            </div>
          </div>
        )}
      </Dialog>
      {ruling && (
        <MoneySheet
          open={!!ruling}
          eyebrow={`${ruling.d.order.orderRef} · ruling`}
          title={ruling.resolution === 'refund_buyer' ? 'Rule: refund the buyer' : 'Rule: pay the seller'}
          amount={ruling.d.order.amount}
          currency={ruling.d.order.currency}
          recipient={
            ruling.resolution === 'refund_buyer'
              ? { name: ruling.d.order.buyer.name, detail: 'The buyer' }
              : { name: ruling.d.order.seller.name, detail: 'The seller' }
          }
          consequence="Your ruling is recorded now and an owner carries it out. Once carried out, it cannot be reversed."
          danger
          actionLabel={`Rule: ${ruling.resolution === 'refund_buyer' ? 'refund' : 'pay'} ${ruling.d.order.amount.toLocaleString('en-NG')} ${ruling.d.order.currency} to ${(ruling.resolution === 'refund_buyer' ? ruling.d.order.buyer.name : ruling.d.order.seller.name).split(' ')[0]}`}
          onClose={() => setRuling(null)}
          onConfirm={async ({ code, reason }) => receiptOf(await rule({ id: ruling.d.id, resolution: ruling.resolution, amount: ruling.d.order.amount, code, reason }))}
        />
      )}
    </>
  );
}
