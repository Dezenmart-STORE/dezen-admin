import { useState } from 'react';
import { errorMessage, failureOf, receiptOf } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useCan } from '../../store';
import { useMarkWithdrawalPaidMutation, useRetryWithdrawalMutation, useWithdrawalsQuery } from '../../store/api';
import type { Withdrawal } from '../../store/types';
import { Table } from '../../components/Table';
import { ListToolbar } from '../../components/ListToolbar';
import { ConfirmDialog, MoneySheet } from '../../components/Dialog';
import { WHO } from '../../components/Choice';
import { ClaimTag } from '../../components/ClaimBar';
import { useAppSelector } from '../../store';
import { useAskRiderToFixBankMutation, useClaimMutation } from '../../store/api';
import { QueueTop, Waited } from '../../components/NextCard';
import { Button, Field, Input, Money, Pagination, Status } from '../../components/ui';

/**
 * Money riders asked to move to their bank. Each stuck withdrawal offers only the one action that
 * fits its cause, so nobody pays the same rider twice: a bank failure → send again;
 * no checked account → record the hand payment.
 */
export function Withdrawals() {
  const can = useCan();
  const list = useListParams({ status: 'stuck' });
  const { data, isLoading, isFetching, error } = useWithdrawalsQuery(list.args);
  const [retry] = useRetryWithdrawalMutation();
  const [markPaid] = useMarkWithdrawalPaidMutation();
  const [acting, setActing] = useState<{ w: Withdrawal; action: 'retry' | 'paid' } | null>(null);
  const [transferRef, setTransferRef] = useState('');
  const mayMove = can('move_money', 'express');
  const me = useAppSelector((s) => s.session.access?.email);
  const [claim] = useClaimMutation();

  const [ask, asking] = useAskRiderToFixBankMutation();
  const [takingOver, setTakingOver] = useState<Withdrawal | null>(null);

  /** What unsticks it, in plain words. Only "Bank turned it back" is fixed by sending again. */
  const STEP: Record<NonNullable<Withdrawal['nextStep']>, string> = {
    send_again: 'Bank turned it back',
    pay_by_hand: 'Pay it by hand',
    rider_fixes_bank: 'Rider must fix their bank details',
    rider_asked: 'Waiting for the rider to fix their bank details',
    top_up_wallet: 'Payout wallet needs topping up',
    awaiting_approval: 'Waiting for a second approval',
  };
  const why = (w: Withdrawal) =>
    w.nextStep === 'pay_by_hand'
      ? 'No checked bank account: send it from the bank, then record it here'
      : w.nextStep === 'rider_asked'
        ? `Asked ${formatDate(w.riderAskedAt)} · the bank said: ${w.lastError}`
        : w.nextStep === 'awaiting_approval' && w.bankDetailsUpdatedAt
          ? `The bank said: ${w.lastError}. The rider changed their bank details ${formatDate(w.bankDetailsUpdatedAt)}`
          : w.lastError
          ? `The bank said: ${w.lastError} · tried ${w.attempts} times`
          : undefined;

  const action = (w: Withdrawal) => {
    if (!w.nextStep) return null;
    if (w.nextStep === 'awaiting_approval' || w.nextStep === 'rider_asked') return null;
    if (w.claim && w.claim.by !== me)
      return (
        <span className="flex flex-col items-end gap-1">
          <ClaimTag claim={w.claim} />
          <Button size="sm" variant="quiet" onClick={() => setTakingOver(w)}>
            Take over
          </Button>
        </span>
      );
    if (w.nextStep === 'rider_fixes_bank')
      return (
        <Button size="sm" busy={asking.isLoading && asking.originalArgs?.id === w.id} onClick={() => ask({ id: w.id })}>
          Ask {w.rider.name.split(' ')[0]} to fix it
        </Button>
      );
    if (w.nextStep === 'top_up_wallet') return <span className="text-right text-[12px] text-ink-3">Finance tops up the payout wallet, then sends again</span>;
    if (!mayMove) return <span className="text-[12px] text-ink-3">{WHO.move_money} act on this</span>;
    return w.nextStep === 'send_again' ? (
      <Button size="sm" variant="primary" onClick={() => setActing({ w, action: 'retry' })}>
        Send again
      </Button>
    ) : (
      <Button
        size="sm"
        onClick={() => {
          setActing({ w, action: 'paid' });
          setTransferRef('');
        }}
      >
        Record hand payment
      </Button>
    );
  };
  const state = (w: Withdrawal) =>
    w.nextStep ? (
      <>
        <span className="text-[13px] font-medium">{STEP[w.nextStep]}</span>
        {why(w) && <p className="mt-1 max-w-[36ch] text-[12px] text-ink-3">{why(w)}</p>}
      </>
    ) : (
      <Status status={w.status} />
    );

  return (
    <>
      <QueueTop
        queue="withdrawals"
        service="express"
        eyebrow="DezenExpress"
        title="Rider withdrawals"
        who={['rider', 'riders']}
        waitFor="for their money"
        description="Grouped by what unsticks each one. Only a bank that turned it back is fixed by sending again."
        clear={['Every rider has been paid.', 'No withdrawal is stuck.']}
      />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Rider"
        statuses={[
          { value: 'stuck', label: 'Needs someone' },
          { value: 'processing', label: 'Sending' },
          { value: 'paid', label: 'Paid' },
          { value: '', label: 'All' },
        ]}
        onChange={list.set}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={errorMessage(error)}
        rowKey={(w) => w.id}
        empty={list.status === 'stuck' ? 'Every rider has been paid.' : 'No withdrawals match.'}
        settledWhenEmpty={list.status === 'stuck'}
        mobile={(w) => ({
          title: w.rider.name,
          subtitle: w.nextStep ? STEP[w.nextStep] : `${w.bank} ${w.accountNumberMasked} · ${formatDate(w.requestedAt)}`,
          amount: <Money amount={w.amount} />,
          status: <Waited since={w.requestedAt} promiseHours={24} />,
        })}
        columns={[
          { header: 'Rider', cell: (w) => <span className="font-semibold">{w.rider.name}</span> },
          { header: 'Amount', align: 'right', cell: (w) => <Money amount={w.amount} /> },
          { header: 'To', cell: (w) => <span className="font-mono text-[12.5px]">{w.bank} {w.accountNumberMasked}</span> },
          { header: 'What it needs', cell: state },
          { header: 'Waiting', align: 'right', cell: (w) => <Waited since={w.requestedAt} promiseHours={24} /> },
          { header: '', cell: (w) => <div className="flex justify-end">{action(w)}</div> },
        ]}
      />
      <ConfirmDialog
        open={!!takingOver}
        title="Take this over?"
        summary={takingOver?.claim ? `${takingOver.claim.name} has been on ${takingOver.rider.name}'s withdrawal since ${formatDate(takingOver.claim.since)}. Talk to them first if you can; they will see that you took it over.` : ''}
        actionLabel="Take it over"
        onClose={() => setTakingOver(null)}
        onConfirm={async () => failureOf(await claim({ kind: 'withdrawal', id: takingOver!.id, takeOver: true }))}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
      {acting && (
        <MoneySheet
          open={acting.action === 'retry'}
          eyebrow={`Withdrawal · failed ${acting.w.attempts} times`}
          title="Send the withdrawal again"
          amount={acting.w.amount}
          recipient={{ name: acting.w.rider.name, detail: `${acting.w.bank} ${acting.w.accountNumberMasked}` }}
          consequence={
            <>
              <span className="block font-semibold text-ink">What happened before</span>
              Tried {acting.w.attempts} {acting.w.attempts === 1 ? 'time' : 'times'}
              {acting.w.lastAttemptAt ? `, last on ${formatDate(acting.w.lastAttemptAt)}` : ''}, to {acting.w.bank} {acting.w.accountNumberMasked}. The bank said: {acting.w.lastError}.
              <span className="mt-1.5 block">If an earlier try did go through, the rider is not paid twice: this reuses the same payment reference.</span>
            </>
          }
          irreversible={false}
          actionLabel={`Send ₦${acting.w.amount.toLocaleString('en-NG')} to ${acting.w.rider.name.split(' ')[0]}`}
          onClose={() => setActing(null)}
          onConfirm={async ({ code }) => receiptOf(await retry({ id: acting.w.id, amount: acting.w.amount, code }))}
        />
      )}
      {acting && (
        <MoneySheet
          open={acting.action === 'paid'}
          eyebrow="Withdrawal · paid by hand"
          title="Record a hand payment"
          amount={acting.w.amount}
          recipient={{ name: acting.w.rider.name, detail: `${acting.w.bank} ${acting.w.accountNumberMasked}` }}
          consequence="Only after you have sent this from the bank. Recording it marks the withdrawal paid; the wallet is not charged again."
          extraReady={transferRef.trim().length > 3}
          actionLabel={`Record ₦${acting.w.amount.toLocaleString('en-NG')} paid to ${acting.w.rider.name.split(' ')[0]}`}
          onClose={() => setActing(null)}
          onConfirm={async ({ code, reason }) =>
            receiptOf(await markPaid({ id: acting.w.id, transferReference: transferRef.trim(), amount: acting.w.amount, code, reason }))
          }
        >
          <Field label="Bank transfer reference" hint="From the bank's receipt.">
            <Input value={transferRef} onChange={(e) => setTransferRef(e.target.value)} className="font-mono" />
          </Field>
        </MoneySheet>
      )}
    </>
  );
}
