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
import { WHO } from '../../components/Choice';
import { Button, PageHeader, Pagination, Status } from '../../components/ui';

/** Delivery companies that carry Shopping and DezenFoods orders. */
export function Providers() {
  const can = useCan();
  const list = useListParams({ status: 'pending' });
  const { data, isLoading, isFetching, error } = useProvidersQuery(list.args);
  const [verify] = useVerifyProviderMutation();
  const [acting, setActing] = useState<{ p: DeliveryProvider; to: 'verified' | 'rejected' } | null>(null);

  const actions = (p: DeliveryProvider) =>
    can('verify', 'express') ? (
      <div className="flex flex-wrap justify-end gap-2">
        {p.status !== 'verified' && (
          <Button size="sm" variant="primary" onClick={() => setActing({ p, to: 'verified' })}>
            Approve
          </Button>
        )}
        {p.status === 'pending' && (
          <Button size="sm" variant="danger" onClick={() => setActing({ p, to: 'rejected' })}>
            Reject
          </Button>
        )}
      </div>
    ) : p.status === 'pending' ? (
      <span className="text-[12px] text-ink-3">{WHO.verify} decide</span>
    ) : null;

  return (
    <>
      <PageHeader service="express" eyebrow="DezenExpress" title="Delivery companies" description="Companies that deliver Shopping and DezenFoods orders." />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Company"
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
        rowKey={(p) => p.id}
        empty={list.status === 'pending' ? 'No companies are waiting for review.' : 'No delivery companies match.'}
        settledWhenEmpty={list.status === 'pending'}
        mobile={(p) => ({ title: p.name, subtitle: p.coverage.join(', '), amount: actions(p), status: <Status status={p.status} /> })}
        columns={[
          {
            header: 'Company',
            cell: (p) => (
              <>
                <p className="font-semibold">{p.name}</p>
                <p className="text-[12.5px] text-ink-3">
                  {p.email} · {p.phone}
                </p>
              </>
            ),
          },
          { header: 'Covers', cell: (p) => <span className="text-ink-2">{p.coverage.join(', ')}</span> },
          { header: 'Deliveries', align: 'right', cell: (p) => <span className="font-mono">{p.deliveriesCompleted}</span> },
          { header: 'Status', cell: (p) => <Status status={p.status} /> },
          { header: 'Joined', cell: (p) => <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(p.createdAt)}</span> },
          { header: '', cell: actions },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
      <ConfirmDialog
        open={!!acting}
        title={acting ? `${acting.to === 'verified' ? 'Approve' : 'Reject'} ${acting.p.name}` : ''}
        summary={acting?.to === 'verified' ? 'Buyers can choose them for delivery, and they are paid for completed deliveries.' : 'They are told the reason and cannot be chosen for delivery.'}
        actionLabel={acting ? `${acting.to === 'verified' ? 'Approve' : 'Reject'} ${acting.p.name}` : ''}
        askReason={acting?.to === 'rejected'}
        reasonHint="The company sees this."
        danger={acting?.to === 'rejected'}
        onClose={() => setActing(null)}
        onConfirm={async (reason) => failureOf(await verify({ id: acting!.p.id, status: acting!.to, reason }))}
      />
    </>
  );
}
