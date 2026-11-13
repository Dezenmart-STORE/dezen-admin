import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { PersonLink } from '../../components/PersonLink';
import { errorMessage, failureOf } from '../../lib/errors';
import { formatDate, formatNaira, humanize } from '../../lib/format';
import { useCan } from '../../store';
import { useFoodOrderQuery, useResolveFoodDisputeMutation, useRetryFoodMoneyMutation } from '../../store/api';
import { RecordPage } from '../../components/RecordPage';
import { ConfirmWithCode } from '../../components/Dialog';
import { Button, Card, ErrorNote, KeyValues, SectionTitle, StatusBadge } from '../../components/ui';

export function FoodOrderDetail() {
  const { id = '' } = useParams();
  const can = useCan();
  const { data: o, isLoading, error } = useFoodOrderQuery(id);
  const [retry] = useRetryFoodMoneyMutation();
  const [resolve] = useResolveFoodDisputeMutation();
  const [dialog, setDialog] = useState<'retry' | 'refund_buyer' | 'release_to_vendor' | null>(null);
  const failed = o?.refund?.status === 'failed' ? o.refund : o?.payout?.status === 'failed' ? o.payout : undefined;
  const mayMove = can('move_money', 'food');
  const openDispute = o?.dispute && !o.dispute.resolved;

  return (
    <RecordPage
      back="/food/orders"
      backLabel="Food orders"
      loading={isLoading}
      error={errorMessage(error)}
      title={<span className="font-mono">{o?.orderRef}</span>}
      badge={o && <StatusBadge status={o.status} />}
      actions={
        o &&
        mayMove && (
          <>
            {failed && <Button variant="primary" onClick={() => setDialog('retry')}>Try payment again</Button>}
            {openDispute && (
              <>
                <Button onClick={() => setDialog('refund_buyer')}>Refund buyer {formatNaira(o.total)}</Button>
                <Button onClick={() => setDialog('release_to_vendor')}>Pay vendor</Button>
              </>
            )}
          </>
        )
      }
      timeline={o?.timeline}
      details={
        o && (
          <KeyValues
            rows={[
              ['Vendor', o.vendor.name],
              ['Buyer', <PersonLink id={o.buyer.id} name={o.buyer.name} />],
              ['Placed', formatDate(o.createdAt)],
              ['How', o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'],
              ['Food', formatNaira(o.subtotal)],
              ['Delivery', formatNaira(o.deliveryFee)],
              ['Service fee', formatNaira(o.serviceFee)],
              ['Total paid', <strong>{formatNaira(o.total)}</strong>],
            ]}
          />
        )
      }
    >
      {o && (
        <>
          <Card className="p-5">
            <SectionTitle>Items</SectionTitle>
            <ul className="space-y-1 text-sm">
              {o.items.map((it, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span>
                    {it.quantity} × {it.name}
                  </span>
                  <span className="text-muted">{formatNaira(it.price * it.quantity)}</span>
                </li>
              ))}
            </ul>
          </Card>
          {(o.payout || o.refund) && (
            <Card className="p-5">
              <SectionTitle>Money</SectionTitle>
              <KeyValues
                rows={[
                  ...(o.payout ? [['Vendor payout', `${formatNaira(o.payout.amount)} · ${humanize(o.payout.status)} · ${o.payout.attempts} attempt(s)`] as [string, string]] : []),
                  ...(o.refund ? [['Buyer refund', `${formatNaira(o.refund.amount)} · ${humanize(o.refund.status)} · ${o.refund.attempts} attempt(s)`] as [string, string]] : []),
                ]}
              />
              {failed?.lastError && <div className="mt-3"><ErrorNote>Last attempt: {failed.lastError}</ErrorNote></div>}
            </Card>
          )}
          {o.dispute && (
            <Card className="p-5">
              <SectionTitle>Dispute</SectionTitle>
              <p className="text-sm">“{o.dispute.reason}”</p>
              <p className="mt-1 text-xs text-muted">
                Opened {formatDate(o.dispute.openedAt)} · {o.dispute.resolved ? 'Settled' : 'Waiting for a ruling'}
              </p>
            </Card>
          )}
        </>
      )}
      {o && (
        <>
          <ConfirmWithCode
            open={dialog === 'retry'}
            title="Try the payment again"
            summary={
              o.refund?.status === 'failed'
                ? `Send ${o.buyer.name} their refund of ${formatNaira(o.refund.amount)} again. Money already sent is never sent twice.`
                : `Pay ${o.vendor.name} ${formatNaira(o.payout?.amount)} again. Money already sent is never sent twice.`
            }
            actionLabel="Send payment"
            onClose={() => setDialog(null)}
            onConfirm={async ({ code }) => failureOf(await retry({ id: o.id, code }))}
          />
          <ConfirmWithCode
            open={dialog === 'refund_buyer' || dialog === 'release_to_vendor'}
            title={dialog === 'refund_buyer' ? 'Refund the buyer' : 'Pay the vendor'}
            summary={
              dialog === 'refund_buyer'
                ? `${o.buyer.name} gets ${formatNaira(o.total)} back and ${o.vendor.name} is not paid. This cannot be undone.`
                : `${o.vendor.name} is paid for this order and ${o.buyer.name} gets nothing back. This cannot be undone.`
            }
            amount={dialog === 'refund_buyer' ? o.total : undefined}
            askReason
            danger
            actionLabel={dialog === 'refund_buyer' ? `Refund ${formatNaira(o.total)}` : 'Pay vendor'}
            onClose={() => setDialog(null)}
            onConfirm={async ({ code, reason }) =>
              failureOf(await resolve({ id: o.id, resolution: dialog as 'refund_buyer' | 'release_to_vendor', code, reason }))
            }
          />
        </>
      )}
    </RecordPage>
  );
}
