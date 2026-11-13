import { useState } from 'react';
import { errorMessage, failureOf } from '../../lib/errors';
import { formatDate, formatNaira } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useCan } from '../../store';
import { useMarkWithdrawalPaidMutation, useRetryWithdrawalMutation, useWithdrawalsQuery } from '../../store/api';
import type { Withdrawal } from '../../store/types';
import { Table } from '../../components/Table';
import { ListToolbar } from '../../components/ListToolbar';
import { ConfirmWithCode } from '../../components/Dialog';
import { Button, Field, Input, PageHeader, Pagination, StatusBadge } from '../../components/ui';

export function Withdrawals() {
  const can = useCan();
  const list = useListParams({ status: 'stuck' });
  const { data, isLoading, isFetching, error } = useWithdrawalsQuery(list.args);
  const [retry] = useRetryWithdrawalMutation();
  const [markPaid] = useMarkWithdrawalPaidMutation();
  const [acting, setActing] = useState<{ w: Withdrawal; action: 'retry' | 'paid' } | null>(null);
  const [transferRef, setTransferRef] = useState('');
  const mayMove = can('move_money', 'express');

  return (
    <>
      <PageHeader title="Rider withdrawals" description="Money riders asked to move from their wallet to their bank." />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Search by rider"
        statuses={[
          { value: 'stuck', label: 'Needs someone' },
          { value: 'processing', label: 'Sending' },
          { value: 'paid', label: 'Paid' },
          { value: '', label: 'All withdrawals' },
        ]}
        onChange={list.set}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(w) => w.id}
        empty="Nothing needs attention."
        columns={[
          { header: 'Rider', cell: (w) => w.rider.name },
          { header: 'Amount', cell: (w) => formatNaira(w.amount), className: 'whitespace-nowrap text-right' },
          { header: 'To', cell: (w) => <span className="text-xs">{w.bank} · {w.accountNumberMasked}</span> },
          {
            header: 'Status',
            cell: (w) => (
              <>
                <StatusBadge status={w.status} />
                {w.lastError && <p className="mt-1 max-w-56 text-xs text-bad">{w.lastError} ({w.attempts} tries)</p>}
                {w.status === 'manual' && <p className="mt-1 max-w-56 text-xs text-muted">No checked bank account: send it by hand, then record it here.</p>}
              </>
            ),
          },
          { header: 'Asked', cell: (w) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(w.requestedAt)}</span> },
          {
            header: '',
            cell: (w) =>
              mayMove && (
                <div className="flex flex-wrap justify-end gap-2">
                  {w.status === 'failed' && <Button onClick={() => setActing({ w, action: 'retry' })}>Send again</Button>}
                  {(w.status === 'manual' || w.status === 'failed') && (
                    <Button variant="ghost" onClick={() => { setActing({ w, action: 'paid' }); setTransferRef(''); }}>
                      Record hand payment
                    </Button>
                  )}
                </div>
              ),
          },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
      <ConfirmWithCode
        open={acting?.action === 'retry'}
        title="Send the withdrawal again"
        summary={acting && `Send ${formatNaira(acting.w.amount)} to ${acting.w.rider.name} at ${acting.w.bank}. Money already sent is never sent twice.`}
        actionLabel="Send again"
        onClose={() => setActing(null)}
        onConfirm={async ({ code }) => failureOf(await retry({ id: acting!.w.id, code }))}
      />
      <ConfirmWithCode
        open={acting?.action === 'paid'}
        title="Record a hand payment"
        summary={acting && `Only after you have sent ${formatNaira(acting.w.amount)} to ${acting.w.rider.name} from the bank. Their wallet is not charged again.`}
        actionLabel="Record as paid"
        askReason
        amount={acting?.w.amount}
        extraReady={transferRef.trim().length > 3}
        onClose={() => setActing(null)}
        onConfirm={async ({ code, reason }) => failureOf(await markPaid({ id: acting!.w.id, transferReference: transferRef.trim(), code, reason }))}
      >
        <Field label="Bank transfer reference">
          <Input value={transferRef} onChange={(e) => setTransferRef(e.target.value)} />
        </Field>
      </ConfirmWithCode>
    </>
  );
}
