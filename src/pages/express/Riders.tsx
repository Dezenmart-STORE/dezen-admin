import { useState } from 'react';
import { errorMessage, failureOf } from '../../lib/errors';
import { formatDate, formatNaira } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useCan } from '../../store';
import { useAdjustRiderWalletMutation, useRidersQuery, useVerifyRiderMutation } from '../../store/api';
import type { Rider } from '../../store/types';
import { Table } from '../../components/Table';
import { ConfirmDialog, ConfirmWithCode } from '../../components/Dialog';
import { ListToolbar } from '../../components/ListToolbar';
import { Badge, Button, Field, Input, PageHeader, Pagination, Select, StatusBadge } from '../../components/ui';

export function Riders() {
  const can = useCan();
  const list = useListParams({ status: 'pending' });
  const { data, isLoading, isFetching, error } = useRidersQuery(list.args);
  const [verify] = useVerifyRiderMutation();
  const [adjust] = useAdjustRiderWalletMutation();
  const [acting, setActing] = useState<{ rider: Rider; to: 'verified' | 'rejected' } | null>(null);
  const [wallet, setWallet] = useState<Rider | null>(null);
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const amountNumber = Number(amount.replace(/[,\s₦]/g, ''));

  return (
    <>
      <PageHeader title="Riders" description="People who drive and deliver for DezenExpress." />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Search by name or plate number"
        statuses={[
          { value: 'pending', label: 'Waiting for review' },
          { value: 'verified', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
          { value: '', label: 'All riders' },
        ]}
        onChange={list.set}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(r) => r.id}
        empty={list.status === 'pending' ? 'No riders are waiting for review.' : 'No riders match.'}
        columns={[
          {
            header: 'Rider',
            cell: (r) => (
              <>
                <p className="font-medium">
                  {r.name} {r.online && <Badge tone="ok">Online</Badge>}
                </p>
                <p className="text-xs text-muted">
                  {r.email} · {r.phone}
                </p>
              </>
            ),
          },
          {
            header: 'Vehicle and licence',
            cell: (r) => (
              <span className="text-xs">
                {r.vehicleType} · {r.plateNumber}
                <br />
                <span className="text-muted">Licence {r.licenceNumber}</span>
              </span>
            ),
          },
          {
            header: 'Paid to',
            cell: (r) =>
              r.payoutAccount ? (
                <span className="text-xs">
                  {r.payoutAccount.bankName} · {r.payoutAccount.accountNumberMasked}
                </span>
              ) : (
                <span className="text-xs text-muted">No checked account: withdrawals are paid by hand</span>
              ),
          },
          { header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
          { header: 'Trips', cell: (r) => r.tripsCompleted, className: 'text-right' },
          { header: 'Wallet', cell: (r) => formatNaira(r.walletBalance), className: 'whitespace-nowrap text-right' },
          { header: 'Applied', cell: (r) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(r.createdAt)}</span> },
          {
            header: '',
            cell: (r) => (
              <div className="flex flex-wrap justify-end gap-2">
                {can('verify', 'express') && r.status !== 'verified' && <Button onClick={() => setActing({ rider: r, to: 'verified' })}>Approve</Button>}
                {can('verify', 'express') && r.status === 'pending' && (
                  <Button variant="danger" onClick={() => setActing({ rider: r, to: 'rejected' })}>
                    Reject
                  </Button>
                )}
                {can('move_money', 'express') && r.status === 'verified' && (
                  <Button variant="ghost" onClick={() => { setWallet(r); setAmount(''); setDirection('credit'); }}>
                    Correct wallet
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
      <ConfirmDialog
        open={!!acting}
        title={acting ? `${acting.to === 'verified' ? 'Approve' : 'Reject'} ${acting.rider.name}` : ''}
        summary={
          acting?.to === 'verified'
            ? 'They can go online and take rides and deliveries. Check the licence and plate number against their documents first.'
            : 'They cannot go online. They are told the reason.'
        }
        actionLabel={acting?.to === 'verified' ? 'Approve' : 'Reject'}
        askReason={acting?.to === 'rejected'}
        reasonHint="The rider sees this"
        danger={acting?.to === 'rejected'}
        onClose={() => setActing(null)}
        onConfirm={async (reason) => failureOf(await verify({ id: acting!.rider.id, status: acting!.to, reason }))}
      />
      <ConfirmWithCode
        open={!!wallet}
        title={`Correct ${wallet?.name ?? ''}'s wallet`}
        summary={`For a trip that was paid wrongly. The wallet holds ${formatNaira(wallet?.walletBalance)} now.`}
        actionLabel={amountNumber > 0 ? `${direction === 'credit' ? 'Add' : 'Take'} ${formatNaira(amountNumber)}` : 'Correct wallet'}
        askReason
        extraReady={amountNumber > 0}
        onClose={() => setWallet(null)}
        onConfirm={async ({ code, reason }) => failureOf(await adjust({ id: wallet!.id, amount: amountNumber, direction, code, reason }))}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Change">
            <Select value={direction} onChange={(e) => setDirection(e.target.value as 'credit' | 'debit')}>
              <option value="credit">Add money</option>
              <option value="debit">Take money</option>
            </Select>
          </Field>
          <Field label="Amount (₦)">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </Field>
        </div>
      </ConfirmWithCode>
    </>
  );
}
