import { useState } from 'react';
import { errorMessage, failureOf } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useCan } from '../../store';
import { useProvidersQuery, useVerifyProviderMutation } from '../../store/api';
import type { DeliveryProvider } from '../../store/types';
import { Table } from '../../components/Table';
import { ListToolbar } from '../../components/ListToolbar';
import { ConfirmDialog } from '../../components/Dialog';
import { Button, PageHeader, Pagination, StatusBadge } from '../../components/ui';

/** Delivery companies that carry Shopping and DezenFoods orders. */
export function Providers() {
  const can = useCan();
  const list = useListParams({ status: 'pending' });
  const { data, isLoading, isFetching, error } = useProvidersQuery(list.args);
  const [verify] = useVerifyProviderMutation();
  const [acting, setActing] = useState<{ p: DeliveryProvider; to: 'verified' | 'rejected' } | null>(null);
  return (
    <>
      <PageHeader title="Delivery companies" description="Companies that deliver Shopping and DezenFoods orders." />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Search by company"
        statuses={[
          { value: 'pending', label: 'Waiting for review' },
          { value: 'verified', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
          { value: '', label: 'All companies' },
        ]}
        onChange={list.set}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(p) => p.id}
        empty="No delivery companies match."
        columns={[
          {
            header: 'Company',
            cell: (p) => (
              <>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted">
                  {p.email} · {p.phone}
                </p>
              </>
            ),
          },
          { header: 'Covers', cell: (p) => p.coverage.join(', ') },
          { header: 'Deliveries', cell: (p) => p.deliveriesCompleted, className: 'text-right' },
          { header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
          { header: 'Joined', cell: (p) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(p.createdAt)}</span> },
          {
            header: '',
            cell: (p) =>
              can('verify', 'express') && (
                <div className="flex flex-wrap justify-end gap-2">
                  {p.status !== 'verified' && <Button onClick={() => setActing({ p, to: 'verified' })}>Approve</Button>}
                  {p.status === 'pending' && (
                    <Button variant="danger" onClick={() => setActing({ p, to: 'rejected' })}>
                      Reject
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
        title={acting ? `${acting.to === 'verified' ? 'Approve' : 'Reject'} ${acting.p.name}` : ''}
        summary={acting?.to === 'verified' ? 'Buyers can choose them for delivery, and they are paid for completed deliveries.' : 'They are told the reason and cannot be chosen for delivery.'}
        actionLabel={acting?.to === 'verified' ? 'Approve' : 'Reject'}
        askReason={acting?.to === 'rejected'}
        reasonHint="The company sees this"
        danger={acting?.to === 'rejected'}
        onClose={() => setActing(null)}
        onConfirm={async (reason) => failureOf(await verify({ id: acting!.p.id, status: acting!.to, reason }))}
      />
    </>
  );
}
