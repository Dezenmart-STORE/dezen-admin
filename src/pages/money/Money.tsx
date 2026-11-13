import { errorMessage } from '../../lib/errors';
import { formatDate, formatNaira } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { usePaymentsQuery, useReconciliationQuery, useWebhooksQuery } from '../../store/api';
import { Table } from '../../components/Table';
import { ListToolbar } from '../../components/ListToolbar';
import { Card, Empty, ErrorNote, Loading, PageHeader, Pagination, Status, StatusBadge } from '../../components/ui';

/** What a payment company's notice means, in plain words. */
const NOTICE: Record<string, string> = {
  'deposit.success': 'Money received',
  'charge.success': 'Payment received',
  'transfer.success': 'Payout sent',
  'transfer.failed': 'Payout failed',
};

const SERVICE: Record<string, string> = { food: 'DezenFoods', express: 'DezenExpress', shopping: 'Shopping', platform: 'Dezenmart' };

export function Payments() {
  const list = useListParams();
  const { data, isLoading, isFetching, error } = usePaymentsQuery(list.args);
  return (
    <>
      <PageHeader service="platform" eyebrow="People and money" title="Payments" description="Every naira that came in or went out, newest first." />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Search by reference or what it was for"
        statuses={[
          { value: '', label: 'All payments' },
          { value: 'failed', label: 'Failed' },
          { value: 'pending', label: 'In progress' },
          { value: 'success', label: 'Done' },
        ]}
        onChange={list.set}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(p) => p.id}
        empty="No payments match."
        columns={[
          { header: 'When', cell: (p) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(p.at)}</span> },
          { header: 'What for', cell: (p) => p.purpose },
          { header: 'Service', cell: (p) => SERVICE[p.service] },
          {
            header: 'Amount',
            cell: (p) => <span className={p.direction === 'in' ? 'text-ok' : ''}>{p.direction === 'in' ? '+' : '−'}{formatNaira(p.amount)}</span>,
            className: 'whitespace-nowrap text-right',
          },
          { header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
          { header: 'Reference', cell: (p) => <span className="font-mono text-xs text-muted">{p.reference}</span> },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}

/** Messages the payment companies send us when money arrives or leaves. */
export function Webhooks() {
  const list = useListParams();
  const { data, isLoading, isFetching, error } = useWebhooksQuery(list.args);
  return (
    <>
      <PageHeader
        service="platform"
        eyebrow="People and money"
        title="Payment notices"
        description="What the payment companies told us. A notice we could not match or trust means money may not have been recorded."
      />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Search by reference"
        statuses={[
          { value: '', label: 'All notices' },
          { value: 'problems', label: 'Problems only' },
        ]}
        onChange={list.set}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(w) => w.id}
        empty="No notices match."
        columns={[
          { header: 'Received', cell: (w) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(w.receivedAt)}</span> },
          { header: 'From', cell: (w) => w.provider },
          {
            header: 'Notice',
            cell: (w) => (
              <>
                <p>{NOTICE[w.event] ?? w.event}</p>
                <p className="font-mono text-[11.5px] text-ink-3">{w.event}</p>
              </>
            ),
          },
          { header: 'Reference', cell: (w) => <span className="font-mono text-xs text-muted">{w.reference}</span> },
          {
            header: 'Result',
            cell: (w) =>
              !w.signatureOk ? (
                <Status status="failed" word="Not trusted" />
              ) : w.handled ? (
                <Status status="done" word="Recorded" />
              ) : (
                <>
                  <Status status="pending" word="Not matched" />
                  {w.error && <p className="mt-1 text-xs text-muted">{w.error}</p>}
                </>
              ),
          },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}

/** Each day the backend compares our records with the payment companies' and flags any gap. */
export function Reconciliation() {
  const { data, isLoading, error } = useReconciliationQuery();
  return (
    <>
      <PageHeader service="platform" eyebrow="People and money" title="Daily balance check" description="Our records compared with what the payment companies hold, every morning. Any gap is flagged." />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorNote>{errorMessage(error)}</ErrorNote>
      ) : !data?.length ? (
        <Card>
          <Empty>No checks have run yet.</Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.map((run) => (
            <Card key={run.id} className="p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-medium">{formatDate(run.ranAt)}</h2>
                {run.ok ? <Status status="done" word="Everything matches" /> : <Status status="failed" word="Gap found" />}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted">
                      <th scope="col" className="py-1 pr-4 font-medium">Check</th>
                      <th scope="col" className="py-1 pr-4 text-right font-medium">Our records</th>
                      <th scope="col" className="py-1 pr-4 text-right font-medium">Payment company</th>
                      <th scope="col" className="py-1 text-right font-medium">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.checks.map((c) => (
                      <tr key={c.name} className="border-t border-line">
                        <td className="py-2 pr-4">{c.name}</td>
                        <td className="py-2 pr-4 text-right">{formatNaira(c.ours)}</td>
                        <td className="py-2 pr-4 text-right">{formatNaira(c.theirs)}</td>
                        <td className={`py-2 text-right ${c.difference ? 'font-semibold text-bad' : 'text-muted'}`}>{formatNaira(c.difference)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
