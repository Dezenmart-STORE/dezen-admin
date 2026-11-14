import { errorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useProvidersQuery } from '../../store/api';
import { Table } from '../../components/Table';
import { ListToolbar } from '../../components/ListToolbar';
import { QueueTop, Waited } from '../../components/NextCard';
import { PageHeader, Pagination, Status } from '../../components/ui';

/** Delivery companies that carry Shopping and DezenFoods orders. */
export function Providers() {
  const list = useListParams({ status: 'pending' });
  const { data, isLoading, isFetching, error } = useProvidersQuery(list.args);

  return (
    <>
      {list.status === 'pending' ? (
        <QueueTop
          queue="providers"
          service="express"
          eyebrow="DezenExpress"
          title="Delivery companies"
          who={['company', 'companies']}
          waitFor="to start delivering"
          description="Open one to check their registration and coverage before approving."
          clear={['No delivery companies are waiting.', 'Every company that applied has an answer.']}
        />
      ) : (
        <PageHeader service="express" eyebrow="DezenExpress" title="Delivery companies" description="Companies that deliver Shopping and DezenFoods orders." />
      )}
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
        href={(p) => `/express/providers/${p.id}`}
        empty={list.status === 'pending' ? 'No companies are waiting for review.' : 'No delivery companies match.'}
        settledWhenEmpty={list.status === 'pending'}
        mobile={(p) => ({ title: p.name, subtitle: p.coverage.join(', '), amount: p.status === 'pending' ? <Waited since={p.createdAt} promiseHours={48} /> : null, status: <Status status={p.status} /> })}
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
          list.status === 'pending'
            ? { header: 'Waiting', align: 'right', cell: (p) => <Waited since={p.createdAt} promiseHours={48} /> }
            : { header: 'Joined', cell: (p) => <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(p.createdAt)}</span> },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}
