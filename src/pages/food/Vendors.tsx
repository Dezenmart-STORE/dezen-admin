import { useState } from 'react';
import { errorMessage, failureOf } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useCan } from '../../store';
import { useReviewVendorMutation, useVendorsQuery } from '../../store/api';
import type { Vendor, VendorStatus } from '../../store/types';
import { Table } from '../../components/Table';
import { ConfirmDialog } from '../../components/Dialog';
import { ListToolbar } from '../../components/ListToolbar';
import { WHO } from '../../components/Choice';
import { Button, PageHeader, Pagination, Status } from '../../components/ui';

type Decision = Exclude<VendorStatus, 'pending'>;
const WORDS: Record<Decision, { verb: string; text: string }> = {
  approved: { verb: 'Approve', text: 'They can start selling on DezenFoods straight away. Check that the kitchen, address and payout name match.' },
  rejected: { verb: 'Reject', text: 'They are told the reason and can apply again.' },
  suspended: { verb: 'Suspend', text: 'Their menu is hidden and they cannot take orders until approved again.' },
};

export function Vendors() {
  const can = useCan();
  const list = useListParams({ status: 'pending' });
  const { data, isLoading, isFetching, error } = useVendorsQuery(list.args);
  const [review] = useReviewVendorMutation();
  const [acting, setActing] = useState<{ vendor: Vendor; to: Decision } | null>(null);
  const mayVerify = can('verify', 'food');

  const actions = (v: Vendor) =>
    mayVerify ? (
      <div className="flex flex-wrap justify-end gap-2">
        {v.status !== 'approved' && (
          <Button size="sm" variant="primary" onClick={() => setActing({ vendor: v, to: 'approved' })}>
            Approve
          </Button>
        )}
        {v.status === 'pending' && (
          <Button size="sm" variant="danger" onClick={() => setActing({ vendor: v, to: 'rejected' })}>
            Reject
          </Button>
        )}
        {v.status === 'approved' && (
          <Button size="sm" variant="danger" onClick={() => setActing({ vendor: v, to: 'suspended' })}>
            Suspend
          </Button>
        )}
      </div>
    ) : (
      <span className="text-[12px] text-ink-3">{WHO.verify} decide</span>
    );

  return (
    <>
      <PageHeader service="food" eyebrow="DezenFoods" title="Vendors" description="Kitchens that sell on DezenFoods." />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Kitchen or owner"
        statuses={[
          { value: 'pending', label: 'To review' },
          { value: 'approved', label: 'Approved' },
          { value: 'suspended', label: 'Suspended' },
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
        rowKey={(v) => v.id}
        empty={list.status === 'pending' ? 'No kitchens are waiting for review.' : 'No vendors match.'}
        settledWhenEmpty={list.status === 'pending'}
        mobile={(v) => ({
          title: v.businessName,
          subtitle: `${v.ownerName} · ${v.lga}, ${v.state}`,
          amount: actions(v),
          status: <Status status={v.status} />,
        })}
        columns={[
          {
            header: 'Kitchen',
            cell: (v) => (
              <>
                <p className="font-semibold">{v.businessName}</p>
                <p className="text-[12.5px] text-ink-3">
                  {v.ownerName} · {v.ownerEmail}
                </p>
              </>
            ),
          },
          { header: 'Where', cell: (v) => <span className="block max-w-[26ch] text-ink-2">{v.address}</span> },
          {
            header: 'Pays out to',
            cell: (v) => (
              <span className="text-[12.5px]">
                {v.payoutAccount.accountName}
                <br />
                <span className="font-mono text-ink-3">
                  {v.payoutAccount.bankName} {v.payoutAccount.accountNumberMasked}
                </span>
              </span>
            ),
          },
          {
            header: 'Status',
            cell: (v) => (
              <>
                <Status status={v.status} />
                {v.rejectionReason && <p className="mt-1 max-w-[24ch] text-[12px] text-ink-3">{v.rejectionReason}</p>}
              </>
            ),
          },
          { header: 'Orders', align: 'right', cell: (v) => <span className="font-mono">{v.ordersCompleted}</span> },
          { header: 'Applied', cell: (v) => <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(v.createdAt)}</span> },
          { header: '', cell: actions },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
      <ConfirmDialog
        open={!!acting}
        title={acting ? `${WORDS[acting.to].verb} ${acting.vendor.businessName}` : ''}
        summary={acting && WORDS[acting.to].text}
        actionLabel={acting ? `${WORDS[acting.to].verb} ${acting.vendor.businessName}` : ''}
        askReason={acting?.to !== 'approved'}
        reasonHint="The vendor sees this."
        danger={acting?.to !== 'approved'}
        onClose={() => setActing(null)}
        onConfirm={async (reason) => failureOf(await review({ id: acting!.vendor.id, status: acting!.to, reason }))}
      />
    </>
  );
}
