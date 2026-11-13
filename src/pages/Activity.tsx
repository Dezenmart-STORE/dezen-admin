import { useState } from 'react';
import { errorMessage } from '../lib/errors';
import { formatDate, humanize } from '../lib/format';
import { useAuditQuery, type AuditEvent } from '../store/api';
import { Table } from '../components/Table';
import { Badge, Button, PageHeader, Select } from '../components/ui';

/** "POST /admin/food/vendors/:id/review" → "Review vendor" style labels, falling back to the route. */
const describe = (action: string) => {
  const known: [RegExp, string][] = [
    [/vendors\/:id\/review$/, 'Reviewed a vendor'],
    [/disputes\/:orderId\/resolve$/, 'Ruled on a food dispute'],
    [/retry-money$/, 'Retried a payment'],
    [/riders\/:riderId\/verify$/, 'Reviewed a rider'],
    [/providers\/:id\/verify$/, 'Reviewed a delivery provider'],
    [/^POST \/admin\/staff\/$/, 'Gave someone access'],
    [/staff\/:id\/disable$/, 'Removed someone’s access'],
    [/staff\/:id\/enable$/, 'Restored someone’s access'],
    [/reset-authenticator$/, 'Reset someone’s authenticator'],
    [/^GET \/admin\/platform\/users/, 'Viewed full user details'],
    [/terms/, 'Changed the terms'],
    [/exchange-rate$/, 'Set the exchange rate'],
    [/tokens$/, 'Changed a user’s token balance'],
    [/sign-out$/, 'Signed out everywhere'],
  ];
  return known.find(([re]) => re.test(action))?.[1] ?? action;
};

const outcome = (e: AuditEvent) =>
  e.statusCode < 300 ? <Badge tone="ok">Done</Badge> : e.statusCode === 403 ? <Badge tone="bad">Refused</Badge> : <Badge tone="warn">Failed ({e.statusCode})</Badge>;

export function Activity() {
  const [service, setService] = useState('');
  const [before, setBefore] = useState<string | undefined>();
  const { data, isLoading, isFetching, error } = useAuditQuery({ service: service || undefined, before });

  return (
    <>
      <PageHeader
        title="Activity log"
        description="Every change staff made or tried to make, and every view of full personal details. Entries cannot be edited or removed."
      />
      <div className="mb-4 w-48">
        <Select
          aria-label="Service"
          value={service}
          onChange={(e) => {
            setService(e.target.value);
            setBefore(undefined);
          }}
        >
          <option value="">All services</option>
          <option value="food">DezenFoods</option>
          <option value="express">DezenExpress</option>
          <option value="shopping">Shopping</option>
          <option value="platform">Platform</option>
        </Select>
      </div>
      <Table
        rows={data}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(e) => e._id}
        empty="Nothing recorded yet."
        columns={[
          { header: 'When', cell: (e) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(e.createdAt)}</span> },
          { header: 'Who', cell: (e) => e.staffEmail ?? '—' },
          {
            header: 'What',
            cell: (e) => (
              <>
                <p>{describe(e.action)}</p>
                {e.target && <p className="font-mono text-xs text-muted">{Object.values(e.target).join(' · ')}</p>}
              </>
            ),
          },
          { header: 'Where', cell: (e) => humanize(e.service) },
          { header: 'Reason', cell: (e) => <span className="text-sm">{e.reason ?? '—'}</span> },
          { header: 'Outcome', cell: outcome },
        ]}
      />
      <div className="mt-4 flex justify-end gap-2">
        {before && (
          <Button variant="ghost" onClick={() => setBefore(undefined)}>
            Back to newest
          </Button>
        )}
        {data && data.length === 50 && (
          <Button busy={isFetching} onClick={() => setBefore(data[data.length - 1].createdAt)}>
            Older
          </Button>
        )}
      </div>
    </>
  );
}
