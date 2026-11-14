import { useState } from 'react';
import { errorMessage } from '../../lib/errors';
import { formatDate, formatNaira } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { usePaymentsQuery, useReconciliationQuery, useWebhooksQuery } from '../../store/api';
import { Table } from '../../components/Table';
import { ListToolbar } from '../../components/ListToolbar';
import { Card, Empty, ErrorNote, Loading, PageHeader, Pagination, SectionTitle, Status, StatusBadge } from '../../components/ui';
import { StatusShape } from '../../components/brand';

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
  const list = useListParams({ status: 'problems' });
  const [technical, setTechnical] = useState(false);
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
          { value: 'problems', label: 'Problems' },
          { value: '', label: 'All notices' },
        ]}
        onChange={list.set}
      />
      <label className="-mt-2 mb-4 flex w-fit cursor-pointer items-center gap-2 text-[13px] text-ink-3">
        <input type="checkbox" checked={technical} onChange={(e) => setTechnical(e.target.checked)} className="h-4 w-4 accent-current" />
        Show technical names
      </label>
      <Table
        rows={data?.items}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(w) => w.id}
        empty={list.status === 'problems' ? 'Every notice was trusted and recorded.' : 'No notices match.'}
        settledWhenEmpty={list.status === 'problems'}
        columns={[
          { header: 'Received', cell: (w) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(w.receivedAt)}</span> },
          { header: 'From', cell: (w) => w.provider },
          {
            header: 'Notice',
            cell: (w) => (
              <>
                <p>{NOTICE[w.event] ?? w.event}</p>
                {technical && <p className="font-mono text-[11.5px] text-ink-3">{w.event}</p>}
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

/** What to look at first when a check does not match, by check. */
const GAP_HINT: Record<string, string> = {
  'Payout wallet balance': 'Look for a payout that left the wallet without a matching record, or one recorded twice. Start with Payments, Failed.',
  'Deposits received yesterday': 'Look for a payment notice we could not match. Start with Payment notices, Problems.',
  'Payouts sent yesterday': 'Look for a payout marked sent that the payment company never sent, or the other way round.',
};

/**
 * Each morning the backend compares our records with the payment companies'. A gap is the only thing
 * that needs a person, so it is pinned on top with what to check; matching days collapse into a streak.
 */
export function Reconciliation() {
  const { data, isLoading, error } = useReconciliationQuery();
  const gaps = data?.filter((r) => !r.ok) ?? [];
  const days = [...(data ?? [])].reverse();
  const latest = data?.[0];
  return (
    <>
      <PageHeader
        service="platform"
        eyebrow="People and money"
        title="Daily balance check"
        headline={
          !data ? undefined : gaps.length ? (
            <>
              <span className="text-need">
                {gaps.length === 1 ? '1 day' : `${gaps.length} days`} did not match
              </span>{' '}
              the payment companies.
            </>
          ) : (
            'Every day matched the payment companies.'
          )
        }
        description="Our records compared with what the payment companies hold, every morning."
      />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorNote>{errorMessage(error)}</ErrorNote>
      ) : !data?.length ? (
        <Card>
          <Empty>No checks have run yet.</Empty>
        </Card>
      ) : (
        <div className="space-y-8">
          {gaps.map((run) => (
            <section key={run.id} aria-label={`Gap on ${formatDate(run.ranAt)}`} className="relative overflow-hidden rounded-leaf border border-need/45 bg-surface">
              <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-need" />
              <div className="p-5 sm:p-6">
                <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">{formatDate(run.ranAt)}</p>
                {run.checks
                  .filter((c) => c.difference)
                  .map((c) => (
                    <div key={c.name} className="mb-4 last:mb-0">
                      <p className="text-[15px] font-semibold">{c.name}</p>
                      <p className="mt-1 font-mono text-[26px] font-semibold text-need">
                        {formatNaira(Math.abs(c.difference))} {c.ours > c.theirs ? 'missing' : 'extra'}
                      </p>
                      <p className="mt-1 text-[14px] text-ink-2">
                        Our records say {formatNaira(c.ours)}. The payment company holds {formatNaira(c.theirs)}.
                      </p>
                      {GAP_HINT[c.name] && <p className="mt-2 max-w-[62ch] text-[13.5px] text-ink-2">{GAP_HINT[c.name]}</p>}
                    </div>
                  ))}
              </div>
            </section>
          ))}

          <section aria-label="Every day">
            <SectionTitle aside={<span className="font-mono text-[12px] text-ink-3">{data.length} days · {gaps.length} {gaps.length === 1 ? 'gap' : 'gaps'}</span>}>Every day</SectionTitle>
            <div className="flex flex-wrap items-center gap-1.5" role="list" aria-label="Days, oldest first">
              {days.map((run) => (
                <span key={run.id} role="listitem" title={`${formatDate(run.ranAt)}: ${run.ok ? 'matched' : 'gap found'}`}>
                  <StatusShape shape={run.ok ? 'circle' : 'petal'} tone={run.ok ? 'settled' : 'need'} size={14} />
                  <span className="sr-only">{formatDate(run.ranAt)}: {run.ok ? 'matched' : 'gap found'}</span>
                </span>
              ))}
            </div>
            <div className="mt-5 space-y-2">
              {data.map((run) => (
                <details key={run.id} className="group rounded-leaf-sm border border-line bg-surface" open={run === latest && run.ok}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[14px]">
                    <span className="font-medium">{formatDate(run.ranAt)}</span>
                    {run.ok ? <Status status="done" word="Matched" /> : <Status status="failed" word="Gap found" />}
                  </summary>
                  {/* A list, not a four-column table, so the gap stays in view on a phone. */}
                  <ul className="divide-y divide-line border-t border-line">
                    {run.checks.map((c) => (
                      <li key={c.name} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                        <span className="min-w-0">
                          <span className="block font-medium">{c.name}</span>
                          <span className="mt-0.5 block font-mono text-[12px] text-ink-3">
                            Ours {formatNaira(c.ours)} · theirs {formatNaira(c.theirs)}
                          </span>
                        </span>
                        <span className={`shrink-0 text-right font-mono ${c.difference ? 'font-semibold text-need' : 'text-ink-3'}`}>
                          {c.difference ? `${formatNaira(Math.abs(c.difference))} gap` : 'No gap'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
