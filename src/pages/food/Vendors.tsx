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
import { Button, PageHeader, Pagination, StatusBadge } from '../../components/ui';

type Decision = Exclude<VendorStatus, 'pending'>;
const WORDS: Record<Decision, { verb: string; text: string }> = {
  approved: { verb: 'Approve', text: 'They can start selling on DezenFoods straight away.' },
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

  return (
    <>
      <PageHeader title="Vendors" description="Kitchens that sell on DezenFoods." />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Search by kitchen or owner"
        statuses={[
          { value: 'pending', label: 'Waiting for review' },
          { value: 'approved', label: 'Approved' },
          { value: 'suspended', label: 'Suspended' },
          { value: 'rejected', label: 'Rejected' },
          { value: '', label: 'All vendors' },
        ]}
        onChange={list.set}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(v) => v.id}
        empty={list.status === 'pending' ? 'No vendors are waiting for review.' : 'No vendors match.'}
        columns={[
          {
            header: 'Vendor',
            cell: (v) => (
              <>
                <p className="font-medium">{v.businessName}</p>
                <p className="text-xs text-muted">
                  {v.ownerName} · {v.ownerEmail}
                </p>
              </>
            ),
          },
          { header: 'Where', cell: (v) => <span className="text-sm">{v.address}</span> },
          {
            header: 'Pays out to',
            cell: (v) => (
              <span className="text-xs">
                {v.payoutAccount.bankName} · {v.payoutAccount.accountNumberMasked}
                <br />
                <span className="text-muted">{v.payoutAccount.accountName}</span>
              </span>
            ),
          },
          {
            header: 'Status',
            cell: (v) => (
              <>
                <StatusBadge status={v.status} />
                {v.rejectionReason && <p className="mt-1 max-w-48 text-xs text-muted">{v.rejectionReason}</p>}
              </>
            ),
          },
          { header: 'Orders', cell: (v) => v.ordersCompleted, className: 'text-right' },
          { header: 'Applied', cell: (v) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(v.createdAt)}</span> },
          {
            header: '',
            cell: (v) =>
              mayVerify && (
                <div className="flex flex-wrap justify-end gap-2">
                  {v.status !== 'approved' && <Button onClick={() => setActing({ vendor: v, to: 'approved' })}>Approve</Button>}
                  {v.status === 'pending' && (
                    <Button variant="danger" onClick={() => setActing({ vendor: v, to: 'rejected' })}>
                      Reject
                    </Button>
                  )}
                  {v.status === 'approved' && (
                    <Button variant="danger" onClick={() => setActing({ vendor: v, to: 'suspended' })}>
                      Suspend
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
        title={acting ? `${WORDS[acting.to].verb} ${acting.vendor.businessName}` : ''}
        summary={acting && WORDS[acting.to].text}
        actionLabel={acting ? WORDS[acting.to].verb : ''}
        askReason={acting?.to !== 'approved'}
        reasonHint="The vendor sees this"
        danger={acting?.to !== 'approved'}
        onClose={() => setActing(null)}
        onConfirm={async (reason) => failureOf(await review({ id: acting!.vendor.id, status: acting!.to, reason }))}
      />
    </>
  );
}
