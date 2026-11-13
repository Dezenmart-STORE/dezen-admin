import { useState } from 'react';
import { errorMessage, receiptOf } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useCan } from '../../store';
import { useMarkWithdrawalPaidMutation, useRetryWithdrawalMutation, useWithdrawalsQuery } from '../../store/api';
import type { Withdrawal } from '../../store/types';
import { Table } from '../../components/Table';
import { ListToolbar } from '../../components/ListToolbar';
import { MoneySheet } from '../../components/Dialog';
import { WHO } from '../../components/Choice';
import { ClaimTag } from '../../components/ClaimBar';
import { useAppSelector } from '../../store';
import { useClaimMutation } from '../../store/api';
import { Button, Field, Input, Money, PageHeader, Pagination, Status } from '../../components/ui';

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
  const [claim, claiming] = useClaimMutation();

  const why = (w: Withdrawal) =>
    w.status === 'failed' ? `${w.lastError} · tried ${w.attempts} times` : w.status === 'manual' ? 'No checked bank account: send it from the bank, then record it here' : undefined;

  const action = (w: Withdrawal) => {
    if (w.status !== 'failed' && w.status !== 'manual') return null;
    if (w.awaitingApproval) return <Status status="pending" word="Waiting for approval" />;
    if (!mayMove) return <span className="text-[12px] text-ink-3">{WHO.move_money} act on this</span>;
    if (w.claim && w.claim.by !== me)
      return (
        <span className="flex flex-col items-end gap-1">
          <ClaimTag claim={w.claim} />
          <Button size="sm" variant="quiet" busy={claiming.isLoading && claiming.originalArgs?.id === w.id} onClick={() => claim({ kind: 'withdrawal', id: w.id, takeOver: true })}>
            Take over
          </Button>
        </span>
      );
    return w.status === 'failed' ? (
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

  return (
    <>
      <PageHeader service="express" eyebrow="DezenExpress" title="Rider withdrawals" description="Money riders asked to move from their wallet to their bank." />
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
          subtitle: why(w) ?? `${w.bank} ${w.accountNumberMasked} · ${formatDate(w.requestedAt)}`,
          amount: <Money amount={w.amount} />,
          status: action(w) ?? <Status status={w.status} />,
        })}
        columns={[
          { header: 'Rider', cell: (w) => <span className="font-semibold">{w.rider.name}</span> },
          { header: 'Amount', align: 'right', cell: (w) => <Money amount={w.amount} /> },
          { header: 'To', cell: (w) => <span className="font-mono text-[12.5px]">{w.bank} {w.accountNumberMasked}</span> },
          {
            header: 'Status',
            cell: (w) => (
              <>
                <Status status={w.status} />
                {why(w) && <p className="mt-1 max-w-[34ch] text-[12px] text-ink-3">{why(w)}</p>}
                {w.claim && (
                  <p className="mt-1">
                    <ClaimTag claim={w.claim} />
                  </p>
                )}
              </>
            ),
          },
          { header: 'Asked', cell: (w) => <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(w.requestedAt)}</span> },
          { header: '', cell: (w) => <div className="flex justify-end">{action(w)}</div> },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
      {acting && (
        <MoneySheet
          open={acting.action === 'retry'}
          eyebrow={`Withdrawal · failed ${acting.w.attempts} times`}
          title="Send the withdrawal again"
          amount={acting.w.amount}
          recipient={{ name: acting.w.rider.name, detail: `${acting.w.bank} ${acting.w.accountNumberMasked}` }}
          consequence={`Last time the bank said: ${acting.w.lastError}. If it actually went through, it will not be paid twice: this reuses the same payment reference.`}
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
