import { errorMessage } from '../lib/errors';
import { formatDate } from '../lib/format';
import { useListParams } from '../lib/useListParams';
import { useAuditQuery } from '../store/api';
import type { AuditEvent } from '../store/types';
import { Table } from '../components/Table';
import { ListToolbar } from '../components/ListToolbar';
import { PageHeader, Pagination, Status } from '../components/ui';
import { SERVICE_LABELS } from './Staff';

const outcome = (e: AuditEvent) =>
  e.outcome === 'done' ? <Status status="done" /> : e.outcome === 'refused' ? <Status status="failed" word="Refused" /> : <Status status="pending" word="Did not go through" />;

export function Activity() {
  const list = useListParams();
  const { data, isLoading, isFetching, error } = useAuditQuery({ ...list.args, service: list.status || undefined });
  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Activity log"
        description="Every change staff made or tried to make, and every time someone looked at full personal details. Entries cannot be edited or removed."
      />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Search by staff email or what happened"
        statuses={[
          { value: '', label: 'All services' },
          { value: 'food', label: SERVICE_LABELS.food },
          { value: 'express', label: SERVICE_LABELS.express },
          { value: 'shopping', label: SERVICE_LABELS.shopping },
          { value: 'platform', label: SERVICE_LABELS.platform },
        ]}
        onChange={list.set}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(e) => e.id}
        empty="Nothing recorded yet."
        columns={[
          { header: 'When', cell: (e) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(e.at)}</span> },
          { header: 'Who', cell: (e) => e.staffEmail },
          { header: 'What', cell: (e) => <span className="text-sm">{e.summary}</span> },
          { header: 'Reason', cell: (e) => <span className="text-sm text-muted">{e.reason ?? '—'}</span> },
          { header: 'Outcome', cell: outcome },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}
