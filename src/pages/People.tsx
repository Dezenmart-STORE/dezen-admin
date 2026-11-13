import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FiEye } from 'react-icons/fi';
import { errorMessage } from '../lib/errors';
import { formatDate, formatNaira } from '../lib/format';
import { useListParams } from '../lib/useListParams';
import { useCan } from '../store';
import { usePeopleQuery, usePersonQuery, useRevealPersonMutation } from '../store/api';
import type { PersonPrivate, Service } from '../store/types';
import { Table } from '../components/Table';
import { ListToolbar } from '../components/ListToolbar';
import { RecordPage } from '../components/RecordPage';
import { Dialog } from '../components/Dialog';
import { Badge, Button, Card, ErrorNote, Field, Input, KeyValues, PageHeader, Pagination, SectionTitle, StatusBadge } from '../components/ui';

const SERVICE: Record<Service, string> = { food: 'DezenFoods', express: 'DezenExpress', shopping: 'Shopping', platform: 'Dezenmart' };

const roles = (p: { isSeller: boolean; isVendor: boolean; isRider: boolean }) => (
  <div className="flex flex-wrap gap-1">
    {p.isSeller && <Badge>Seller</Badge>}
    {p.isVendor && <Badge>Vendor</Badge>}
    {p.isRider && <Badge>Rider</Badge>}
  </div>
);

export function People() {
  const list = useListParams();
  const { data, isLoading, isFetching, error } = usePeopleQuery(list.args);
  return (
    <>
      <PageHeader title="People" description="Customer accounts across Shopping, DezenFoods and DezenExpress. Contact details are partly hidden." />
      <ListToolbar q={list.q} placeholder="Search by name, email or phone" onChange={list.set} />
      <Table
        rows={data?.items}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(p) => p.id}
        empty="Nobody matches."
        columns={[
          {
            header: 'Person',
            cell: (p) => (
              <Link to={`/people/${p.id}`} className="block">
                <span className="font-medium text-info hover:underline">{p.name}</span>
                <span className="block text-xs text-muted">
                  {p.emailMasked}
                  {p.phoneMasked && ` · ${p.phoneMasked}`}
                </span>
              </Link>
            ),
          },
          { header: 'Also', cell: roles },
          { header: 'Joined', cell: (p) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(p.joinedAt)}</span> },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}

/** One person across every service: what they ordered and booked, and the money. */
export function PersonDetail() {
  const { id = '' } = useParams();
  const can = useCan();
  const { data: p, isLoading, error } = usePersonQuery(id);
  const [reveal, revealing] = useRevealPersonMutation();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [revealed, setRevealed] = useState<PersonPrivate | null>(null);
  const [revealError, setRevealError] = useState('');

  const doReveal = async () => {
    const res = await reveal({ id, reason: reason.trim() });
    if ('error' in res) return setRevealError(errorMessage(res.error));
    setRevealed(res.data);
    setAsking(false);
  };

  return (
    <RecordPage
      back="/people"
      backLabel="People"
      loading={isLoading}
      error={errorMessage(error)}
      title={p?.name}
      badge={p && roles(p)}
      actions={
        p && can('read_pii', 'platform') && !revealed && (
          <Button onClick={() => { setAsking(true); setReason(''); setRevealError(''); }}>
            <FiEye aria-hidden /> Show full details
          </Button>
        )
      }
      details={
        p && (
          <KeyValues
            rows={
              revealed
                ? [
                    ['Email', revealed.email],
                    ['Phone', revealed.phone],
                    ['Address', revealed.address],
                    ['Bank', revealed.bankName],
                    ['Account number', revealed.accountNumber],
                    ['Joined', formatDate(p.joinedAt)],
                  ]
                : [
                    ['Email', p.emailMasked],
                    ['Phone', p.phoneMasked],
                    ['Joined', formatDate(p.joinedAt)],
                  ]
            }
          />
        )
      }
    >
      {p && (
        <>
          <Card className="p-5">
            <SectionTitle>Orders and trips</SectionTitle>
            {p.activity.length === 0 ? (
              <p className="text-sm text-muted">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {p.activity.map((a) => (
                  <li key={a.ref} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <Link to={a.link} className="font-mono text-info hover:underline">
                        {a.ref}
                      </Link>{' '}
                      <span className="text-muted">· {SERVICE[a.service]} · {formatDate(a.at)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={a.status} />
                      <span className="w-28 text-right">{a.currency === 'NGN' ? formatNaira(a.amount) : `${a.amount.toLocaleString('en-NG')} ${a.currency}`}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <SectionTitle>Payments</SectionTitle>
            {p.payments.length === 0 ? (
              <p className="text-sm text-muted">No payments.</p>
            ) : (
              <ul className="divide-y divide-line">
                {p.payments.map((x) => (
                  <li key={x.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                    <span>{x.purpose}</span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={x.status} /> {formatNaira(x.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
      <Dialog open={asking} title="Show full details" onClose={() => setAsking(false)}>
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Their full email, phone, address and bank details are shown. This is logged with your name and the reason.
          </p>
          <Field label="Why do you need them?">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Refund for FD-1043 failed; checking the bank account" autoFocus />
          </Field>
          <ErrorNote>{revealError}</ErrorNote>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={reason.trim().length < 3} busy={revealing.isLoading} onClick={doReveal}>
              Show details
            </Button>
          </div>
        </div>
      </Dialog>
    </RecordPage>
  );
}
