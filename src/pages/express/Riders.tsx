import { useState } from 'react';
import { errorMessage, receiptOf } from '../../lib/errors';
import { formatDate, humanize } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useCan } from '../../store';
import { useAdjustRiderWalletMutation, useRidersQuery } from '../../store/api';
import type { Rider } from '../../store/types';
import { Table } from '../../components/Table';
import { MoneySheet } from '../../components/Dialog';
import { ListToolbar } from '../../components/ListToolbar';
import { QueueTop, Waited } from '../../components/NextCard';
import { Button, Field, Input, Money, PageHeader, Pagination, Segments, Status, Tag } from '../../components/ui';

export function Riders() {
  const can = useCan();
  const list = useListParams({ status: 'pending' });
  const { data, isLoading, isFetching, error } = useRidersQuery(list.args);
  const [adjust] = useAdjustRiderWalletMutation();
  const [wallet, setWallet] = useState<Rider | null>(null);
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'credit' | 'debit'>('debit');
  const value = Number(amount.replace(/[,\s₦]/g, ''));
  const after = wallet ? wallet.walletBalance + (direction === 'credit' ? value : -value) : 0;
  const valid = value > 0 && after >= 0;

  const actions = (r: Rider) => (
    <div className="flex flex-wrap justify-end gap-2">
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
    </div>
  );

  return (
    <>
      {list.status === 'pending' ? (
        <QueueTop
          queue="riders"
          service="express"
          eyebrow="DezenExpress"
          title="Riders"
          who={['rider', 'riders']}
          waitFor="to start earning"
          description="Open a rider to see their licence and plate photos beside what they typed. Approve unlocks once each check is ticked."
          clear={['No riders are waiting to be checked.', 'Everyone who applied can drive or has been told what to fix.']}
        />
      ) : (
        <PageHeader service="express" eyebrow="DezenExpress" title="Riders" description="The people who drive and deliver." />
      )}
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
        href={(r) => `/express/riders/${r.id}`}
        empty={list.status === 'pending' ? 'No riders are waiting for review.' : 'No riders match.'}
        settledWhenEmpty={list.status === 'pending'}
        mobile={(r) => ({
          title: r.name,
          subtitle: `${r.vehicleType} · ${r.plateNumber}`,
          amount: r.status === 'pending' ? <Waited since={r.createdAt} promiseHours={48} /> : <Money amount={r.walletBalance} />,
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
          list.status === 'pending'
            ? { header: 'Waiting', align: 'right', cell: (r) => <Waited since={r.createdAt} promiseHours={48} /> }
            : { header: 'Applied', cell: (r) => <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(r.createdAt)}</span> },
          { header: '', cell: actions },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
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
