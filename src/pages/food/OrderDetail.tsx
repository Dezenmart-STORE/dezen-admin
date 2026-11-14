import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { errorMessage, receiptOf } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useCan } from '../../store';
import { useFoodOrderQuery, useResolveFoodDisputeMutation, useRetryFoodMoneyMutation } from '../../store/api';
import type { FoodOrderDetail } from '../../store/types';
import { RecordPage } from '../../components/RecordPage';
import { MoneySheet } from '../../components/Dialog';
import { WHO } from '../../components/Choice';
import { PersonLink } from '../../components/PersonLink';
import { ageWords, isLate } from '../../components/NextCard';
import { StatusShape } from '../../components/brand';
import { ClaimBar, useClaimedByOther } from '../../components/ClaimBar';
import { Button, Card, ErrorNote, KeyValues, Locked, Money, SectionTitle, Status } from '../../components/ui';

type Dialog = 'retry' | 'ruling' | null;
type Split = { back: number; vendor: number; all: 'buyer' | 'vendor' | null };

const ordinal = (n: number) => (n === 1 ? 'first' : n === 2 ? 'second' : n === 3 ? 'third' : `${n}th`);

/** A food order. With a dispute open, it reads as a case file: both sides, the facts, then the decision. */
export function FoodOrderDetail() {
  const { id = '' } = useParams();
  const can = useCan();
  const { data: o, isLoading, error } = useFoodOrderQuery(id);
  const [retry] = useRetryFoodMoneyMutation();
  const [resolve] = useResolveFoodDisputeMutation();
  const [dialog, setDialogState] = useState<Dialog>(null);
  const [split, setSplit] = useState<Split | null>(null);
  // The sheet works from the order as it was when opened, so its receipt survives the refresh.
  const [snap, setSnap] = useState<FoodOrderDetail | null>(null);
  const setDialog = (d: Dialog) => {
    if (d && o) setSnap(o);
    setDialogState(d);
  };
  const heldBy = useClaimedByOther(o?.claim);
  const mayMove = can('move_money', 'food') && !heldBy;
  const failed = o?.refund?.status === 'failed' ? o.refund : o?.payout?.status === 'failed' ? o.payout : undefined;
  const failedIsRefund = !!o && failed === o.refund;
  const openDispute = !!o?.dispute && !o.dispute.resolved;
  const snapFailed = snap?.refund?.status === 'failed' ? snap.refund : snap?.payout?.status === 'failed' ? snap.payout : undefined;
  const snapIsRefund = !!snap && snapFailed === snap.refund;

  const retryAction =
    o && failed ? (
      mayMove ? (
        <Button variant="primary" onClick={() => setDialog('retry')}>
          {failedIsRefund ? 'Send the refund again' : 'Pay the vendor again'}
        </Button>
      ) : (
        <Locked who={heldBy ? heldBy.name : WHO.move_money}>{failedIsRefund ? 'Send the refund again' : 'Pay the vendor again'}</Locked>
      )
    ) : undefined;

  return (
    <RecordPage
      back={openDispute ? '/food/disputes' : '/food/orders'}
      backLabel={openDispute ? 'Food disputes' : 'Food orders'}
      service="food"
      kind={openDispute ? `Dispute · ${o?.orderRef ?? ''}` : 'Food order'}
      loading={isLoading}
      error={errorMessage(error)}
      title={
        openDispute && o?.dispute ? (
          <>
            {o.buyer.name} has waited <span className={isLate(o.dispute.openedAt, 48) ? 'text-need' : ''}>{ageWords(o.dispute.openedAt)}</span> for a ruling
          </>
        ) : (
          <span className="font-mono">{o?.orderRef}</span>
        )
      }
      badge={o && <Status status={o.status} />}
      actions={retryAction}
      timeline={o?.timeline}
    >
      {o && (
        <>
          {(failed || openDispute) && <ClaimBar kind="food-order" id={o.id} claim={o.claim} />}
          {failed && (
            <Card className="border-need/40 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="mt-1.5">
                  <StatusShape shape="petal" tone="need" size={10} />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">
                    {failedIsRefund ? `${o.buyer.name}'s refund` : `${o.vendor.name}'s payout`} of <Money amount={failed.amount} /> failed {failed.attempts} times
                  </p>
                  {failed.lastError && <p className="mt-1 text-sm text-ink-2">The bank said: {failed.lastError}</p>}
                </div>
              </div>
            </Card>
          )}

          {openDispute && o.dispute && (
            <section>
              <SectionTitle aside={<span className="font-mono text-[11.5px] text-ink-3">opened {formatDate(o.dispute.openedAt)}</span>}>The case</SectionTitle>
              <Card className="space-y-5 p-5 sm:p-6">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">The buyer says</p>
                  <p className="mt-1.5 text-[18px] leading-snug">“{o.dispute.reason}”</p>
                  {o.case && (
                    <p className="mt-1.5 text-[13px] text-ink-3">
                      <PersonLink id={o.buyer.id} name={o.buyer.name} /> · {ordinal(o.case.buyerDisputes90d + 1)} dispute in 90 days · {o.case.buyerOrders} orders
                    </p>
                  )}
                </div>
                {o.case?.vendorSays && (
                  <div className="border-l-2 border-line pl-4">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">The vendor says</p>
                    <p className="mt-1 text-[15px]">“{o.case.vendorSays}”</p>
                    <p className="mt-1 text-[13px] text-ink-3">
                      {o.vendor.name} · {o.case.vendorDisputesLost} {o.case.vendorDisputesLost === 1 ? 'dispute' : 'disputes'} lost
                    </p>
                  </div>
                )}
                {o.case?.whatHappened && (
                  <div className="border-l-2 border-need/60 pl-4">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">What happened</p>
                    <p className="mt-1 text-[15px]">{o.case.whatHappened}</p>
                  </div>
                )}
              </Card>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {mayMove ? (
                  <div className="sm:col-span-2">
                    <SplitRuling
                      total={o.total}
                      food={o.subtotal}
                      buyer={o.buyer.name}
                      vendor={o.vendor.name}
                      onRule={(s) => {
                        setSplit(s);
                        setDialog('ruling');
                      }}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-ink-3 sm:col-span-2">
                    {heldBy ? `${heldBy.name} is handling this dispute. Take it over above to rule on it.` : `${WHO.move_money} rules on disputes. You can read the whole case here.`}
                  </p>
                )}
              </div>
            </section>
          )}

          <Card className="p-5 sm:p-6">
            <KeyValues
              rows={[
                ['Vendor', o.vendor.name],
                ['Buyer', <PersonLink id={o.buyer.id} name={o.buyer.name} />],
                ['Placed', formatDate(o.createdAt)],
                ['How', o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'],
              ]}
            />
            <ul className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
              {o.items.map((it, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span>
                    <span className="font-mono text-ink-3">{it.quantity}×</span> {it.name}
                  </span>
                  <Money amount={it.price * it.quantity} className="text-ink-2" />
                </li>
              ))}
              <li className="flex justify-between gap-4 pt-2 text-ink-2">
                <span>Delivery</span>
                <Money amount={o.deliveryFee} />
              </li>
              <li className="flex justify-between gap-4 text-ink-2">
                <span>Service fee</span>
                <Money amount={o.serviceFee} />
              </li>
              <li className="flex justify-between gap-4 border-t border-line pt-2 font-semibold">
                <span>Paid by the buyer</span>
                <Money amount={o.total} />
              </li>
            </ul>
            {(o.payout || o.refund) && (
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-4 text-sm">
                {o.payout && (
                  <span className="flex items-center gap-2">
                    Vendor payout <Status status={o.payout.status} />
                  </span>
                )}
                {o.refund && (
                  <span className="flex items-center gap-2">
                    Buyer refund <Status status={o.refund.status} />
                  </span>
                )}
              </div>
            )}
          </Card>
          {failed && !mayMove && !heldBy && <ErrorNote>{WHO.move_money} can send this payment again.</ErrorNote>}

          {snap && snapFailed && (
            <MoneySheet
              open={dialog === 'retry'}
              eyebrow={`${snap.orderRef} · try again`}
              title={snapIsRefund ? 'Send the refund again' : 'Pay the vendor again'}
              amount={snapFailed.amount}
              recipient={{ name: snapIsRefund ? snap.buyer.name : snap.vendor.name, detail: snapIsRefund ? 'Back to the account they paid from' : 'To their payout account on file' }}
              consequence="If the first attempt actually went through, the bank will not pay twice: this reuses the same payment reference."
              irreversible={false}
              actionLabel={`Send ₦${snapFailed.amount.toLocaleString('en-NG')} to ${(snapIsRefund ? snap.buyer.name : snap.vendor.name).split(' ')[0]}`}
              onClose={() => setDialog(null)}
              onConfirm={async ({ code }) => receiptOf(await retry({ id: snap.id, amount: snapFailed.amount, code }))}
            />
          )}
          {snap && split && (
            <MoneySheet
              open={dialog === 'ruling'}
              eyebrow={`${snap.orderRef} · ruling`}
              title={split.all === 'buyer' ? 'Refund the buyer' : split.all === 'vendor' ? 'Pay the vendor' : 'Split the order'}
              amount={split.all === 'vendor' ? split.vendor : split.back}
              recipient={
                split.all === 'vendor'
                  ? { name: snap.vendor.name, detail: 'To their payout account on file' }
                  : { name: snap.buyer.name, detail: 'Back to the account they paid from' }
              }
              consequence={
                split.all === 'buyer'
                  ? `${snap.buyer.name} gets everything back, fees included, and ${snap.vendor.name} is not paid for this order.`
                  : split.all === 'vendor'
                    ? `${snap.vendor.name} is paid for the food, and ${snap.buyer.name} gets nothing back.`
                    : `${snap.vendor.name} is paid ₦${split.vendor.toLocaleString('en-NG')} for the rest of the food. Delivery and service fees are kept.`
              }
              danger
              actionLabel={
                split.all === 'vendor'
                  ? `Pay ₦${split.vendor.toLocaleString('en-NG')} to ${snap.vendor.name}`
                  : split.all === 'buyer'
                    ? `Refund ₦${split.back.toLocaleString('en-NG')} to ${snap.buyer.name.split(' ')[0]}`
                    : `Refund ₦${split.back.toLocaleString('en-NG')} to ${snap.buyer.name.split(' ')[0]}, pay the rest`
              }
              onClose={() => setDialog(null)}
              onConfirm={async ({ code, reason }) =>
                receiptOf(
                  await resolve({
                    id: snap.id,
                    resolution: split.all === 'buyer' ? 'refund_buyer' : split.all === 'vendor' ? 'release_to_vendor' : 'split',
                    amount: split.all === 'vendor' ? split.vendor : split.back,
                    vendorAmount: split.all ? undefined : split.vendor,
                    code,
                    reason,
                  }),
                )
              }
            />
          )}
        </>
      )}
    </RecordPage>
  );
}

/**
 * The ruling as a split, not a coin toss. "Half the order was missing" deserves half back.
 * The buyer and vendor share the food price; delivery and service fees are kept unless
 * everything goes back to the buyer.
 */
function SplitRuling({ total, food, buyer, vendor, onRule }: { total: number; food: number; buyer: string; vendor: string; onRule: (s: Split) => void }) {
  type Stop = 'buyer' | 'half' | 'vendor' | 'typed';
  const [stop, setStop] = useState<Stop>('half');
  const [typed, setTyped] = useState('');
  const typedBack = Math.round(Number(typed.replace(/[,\s₦]/g, '')));
  const back = stop === 'buyer' ? total : stop === 'vendor' ? 0 : stop === 'half' ? Math.round(food / 2) : typedBack;
  const toVendor = stop === 'buyer' ? 0 : stop === 'vendor' ? food : food - back;
  const valid = stop === 'buyer' || stop === 'vendor' || stop === 'half' || (typedBack > 0 && typedBack < food);
  const buyerPct = stop === 'buyer' ? 100 : Math.max(0, Math.min(100, Math.round((back / food) * 100)));
  const first = buyer.split(' ')[0];
  const STOPS: { v: Stop; label: string }[] = [
    { v: 'buyer', label: `All to ${first}` },
    { v: 'half', label: 'Half' },
    { v: 'vendor', label: 'All to the vendor' },
    { v: 'typed', label: 'Type an amount' },
  ];
  return (
    <Card className="p-5 sm:p-6">
      <p className="text-[15px] font-semibold">Who gets the money?</p>
      <div role="radiogroup" aria-label="Ruling" className="mt-3 flex flex-wrap gap-1.5">
        {STOPS.map((s) => (
          <button
            key={s.v}
            type="button"
            role="radio"
            aria-checked={stop === s.v}
            onClick={() => setStop(s.v)}
            className={`h-9 cursor-pointer rounded-leaf-sm border px-3.5 text-[13px] font-medium transition-colors ${stop === s.v ? 'border-transparent bg-primary text-on-primary' : 'border-line text-ink-2 hover:border-ink-3 hover:text-ink'}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {stop === 'typed' && (
        <label className="mt-4 block max-w-[16rem]">
          <span className="mb-1.5 block text-[13px] font-semibold">Back to {first} (₦)</span>
          <input
            inputMode="decimal"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="h-11 w-full rounded-leaf-sm border border-line bg-ground px-3.5 font-mono text-[14.5px] focus:border-ink-2 focus:outline-none"
          />
          <span className="mt-1.5 block text-xs text-ink-3">Between ₦1 and ₦{(food - 1).toLocaleString('en-NG')}. The rest goes to the vendor.</span>
        </label>
      )}
      <div aria-hidden className="mt-5 flex h-3 overflow-hidden rounded-full bg-raised">
        <span className="bg-need transition-[width] duration-300" style={{ width: `${valid ? buyerPct : 0}%` }} />
        <span className="flex-1 bg-ink-3/60" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 text-[13px] text-ink-2">
        <div>
          Back to {buyer}
          <span className="mt-0.5 block font-mono text-[18px] font-semibold text-ink">{valid ? <Money amount={back} /> : '—'}</span>
        </div>
        <div className="text-right">
          To {vendor}
          <span className="mt-0.5 block font-mono text-[18px] font-semibold text-ink">{valid ? <Money amount={toVendor} /> : '—'}</span>
        </div>
      </div>
      <p className="mt-3 text-[12.5px] text-ink-3">
        {stop === 'buyer' ? 'Everything they paid comes back, delivery and service fee included.' : 'They share the food price. Delivery and service fees are kept.'}
      </p>
      <Button
        variant="primary"
        size="lg"
        className="mt-5 w-full sm:w-auto"
        disabled={!valid}
        onClick={() => onRule({ back, vendor: toVendor, all: stop === 'buyer' ? 'buyer' : stop === 'vendor' ? 'vendor' : null })}
      >
        Rule this way
      </Button>
    </Card>
  );
}
