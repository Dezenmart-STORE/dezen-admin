import { useState } from 'react';
import { errorMessage, failureOf, receiptOf } from '../../lib/errors';
import { formatDate, humanize } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useCan } from '../../store';
import { useAdjustRiderWalletMutation, useRidersQuery, useVerifyRiderMutation } from '../../store/api';
import type { Rider } from '../../store/types';
import { Table } from '../../components/Table';
import { ConfirmDialog, MoneySheet } from '../../components/Dialog';
import { ListToolbar } from '../../components/ListToolbar';
import { WHO } from '../../components/Choice';
import { Button, Field, Input, Money, PageHeader, Pagination, Segments, Status, Tag } from '../../components/ui';

export function Riders() {
  const can = useCan();
  const list = useListParams({ status: 'pending' });
  const { data, isLoading, isFetching, error } = useRidersQuery(list.args);
  const [verify] = useVerifyRiderMutation();
  const [adjust] = useAdjustRiderWalletMutation();
  const [acting, setActing] = useState<{ rider: Rider; to: 'verified' | 'rejected' } | null>(null);
  const [wallet, setWallet] = useState<Rider | null>(null);
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'credit' | 'debit'>('debit');
  const value = Number(amount.replace(/[,\s₦]/g, ''));
  const after = wallet ? wallet.walletBalance + (direction === 'credit' ? value : -value) : 0;
  const valid = value > 0 && after >= 0;

  const actions = (r: Rider) => (
    <div className="flex flex-wrap justify-end gap-2">
      {can('verify', 'express') && r.status !== 'verified' && (
        <Button size="sm" variant="primary" onClick={() => setActing({ rider: r, to: 'verified' })}>
          Approve
        </Button>
      )}
      {can('verify', 'express') && r.status === 'pending' && (
        <Button size="sm" variant="danger" onClick={() => setActing({ rider: r, to: 'rejected' })}>
          Reject
        </Button>
      )}
      {r.status === 'verified' &&
        (can('move_money', 'express') ? (
          <Button
            size="sm"
            variant="quiet"
            onClick={() => {
              setWallet(r);
              setAmount('');
              setDirection('debit');
            }}
          >
            Correct wallet
          </Button>
        ) : null)}
      {!can('verify', 'express') && r.status === 'pending' && <span className="text-[12px] text-ink-3">{WHO.verify} decide</span>}
    </div>
  );

  return (
    <>
      <PageHeader service="express" eyebrow="DezenExpress" title="Riders" description="The people who drive and deliver. Approve only after checking the licence and plate against their documents." />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Name or plate number"
        statuses={[
          { value: 'pending', label: 'To review' },
          { value: 'verified', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
          { value: '', label: 'All' },
        ]}
        onChange={list.set}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={errorMessage(error)}
        rowKey={(r) => r.id}
        empty={list.status === 'pending' ? 'No riders are waiting for review.' : 'No riders match.'}
        settledWhenEmpty={list.status === 'pending'}
        mobile={(r) => ({
          title: r.name,
          subtitle: `${r.vehicleType} · ${r.plateNumber}`,
          amount: actions(r),
          status: <Status status={r.status} />,
        })}
        columns={[
          {
            header: 'Rider',
            cell: (r) => (
              <>
                <p className="flex items-center gap-2 font-semibold">
                  {r.name} {r.online && <Tag tone="settled">Online</Tag>}
                </p>
                <p className="text-[12.5px] text-ink-3">
                  {r.email} · {r.phone}
                </p>
              </>
            ),
          },
          {
            header: 'Vehicle and licence',
            cell: (r) => (
              <span className="text-[12.5px]">
                {humanize(r.vehicleType)} · <span className="font-mono">{r.plateNumber}</span>
                <br />
                <span className="font-mono text-ink-3">{r.licenceNumber}</span>
              </span>
            ),
          },
          {
            header: 'Paid to',
            cell: (r) =>
              r.payoutAccount ? (
                <span className="font-mono text-[12.5px]">
                  {r.payoutAccount.bankName} {r.payoutAccount.accountNumberMasked}
                </span>
              ) : (
                <span className="text-[12.5px] text-waiting">No checked account · paid by hand</span>
              ),
          },
          { header: 'Status', cell: (r) => <Status status={r.status} /> },
          { header: 'Trips', align: 'right', cell: (r) => <span className="font-mono">{r.tripsCompleted}</span> },
          { header: 'Wallet', align: 'right', cell: (r) => <Money amount={r.walletBalance} /> },
          { header: 'Applied', cell: (r) => <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(r.createdAt)}</span> },
          { header: '', cell: actions },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
      <ConfirmDialog
        open={!!acting}
        title={acting ? `${acting.to === 'verified' ? 'Approve' : 'Reject'} ${acting.rider.name}` : ''}
        summary={
          acting?.to === 'verified'
            ? `${acting.rider.name} can go online and take rides and deliveries. Licence ${acting.rider.licenceNumber}, plate ${acting.rider.plateNumber}.`
            : 'They cannot go online, and they are told the reason.'
        }
        actionLabel={acting ? `${acting.to === 'verified' ? 'Approve' : 'Reject'} ${acting.rider.name.split(' ')[0]}` : ''}
        askReason={acting?.to === 'rejected'}
        reasonHint="The rider sees this."
        danger={acting?.to === 'rejected'}
        onClose={() => setActing(null)}
        onConfirm={async (reason) => failureOf(await verify({ id: acting!.rider.id, status: acting!.to, reason }))}
      />
      {wallet && (
        <MoneySheet
          open={!!wallet}
          eyebrow={`${wallet.name} · wallet`}
          title="Correct the wallet"
          amount={valid ? value : 0}
          recipient={{ name: `${wallet.name}'s wallet`, detail: 'Inside DezenExpress; nothing goes to a bank' }}
          consequence={
            <>
              Wallet now <Money amount={wallet.walletBalance} /> → after{' '}
              <span className={after < 0 ? 'font-semibold text-need' : 'font-semibold text-ink'}>
                <Money amount={after} />
              </span>
              . Use this only to fix a trip that was paid wrongly.
            </>
          }
          irreversible={false}
          danger={direction === 'debit'}
          extraReady={valid}
          actionLabel={valid ? `${direction === 'credit' ? 'Add' : 'Take'} ₦${value.toLocaleString('en-NG')} ${direction === 'credit' ? 'to' : 'from'} ${wallet.name.split(' ')[0]}` : 'Enter an amount'}
          onClose={() => setWallet(null)}
          onConfirm={async ({ code, reason }) => receiptOf(await adjust({ id: wallet.id, amount: value, direction, code, reason }))}
        >
          <Segments
            label="Change"
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'debit', label: 'Take money' },
              { value: 'credit', label: 'Add money' },
            ]}
          />
          <Field label="Amount (₦)" hint={after < 0 ? 'That is more than the wallet holds.' : undefined}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="font-mono" />
          </Field>
        </MoneySheet>
      )}
    </>
  );
}
