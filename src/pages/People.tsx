import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { errorMessage } from '../lib/errors';
import { formatDate } from '../lib/format';
import { useListParams } from '../lib/useListParams';
import { useAppSelector, useCan } from '../store';
import { usePeopleQuery, usePersonQuery, useRevealPersonMutation } from '../store/api';
import type { PersonDetail as PersonRecord, PersonPrivate } from '../store/types';
import { Table } from '../components/Table';
import { ListToolbar } from '../components/ListToolbar';
import { RecordPage } from '../components/RecordPage';
import { CodeSheet } from '../components/Dialog';
import { WHO } from '../components/Choice';
import { ServiceGlyph, StatusShape } from '../components/brand';
import { ageWords } from '../components/NextCard';
import { Button, Card, KeyValues, Locked, Money, PageHeader, Pagination, SectionTitle, Status, Tag } from '../components/ui';

const roles = (p: { isSeller: boolean; isVendor: boolean; isRider: boolean }) => (
  <span className="flex flex-wrap gap-1.5">
    {p.isSeller && <Tag>Seller</Tag>}
    {p.isVendor && <Tag>Vendor</Tag>}
    {p.isRider && <Tag>Rider</Tag>}
  </span>
);

export function People() {
  const list = useListParams();
  const { data, isLoading, isFetching, error } = usePeopleQuery(list.args);
  return (
    <>
      <PageHeader service="platform" eyebrow="People and money" title="People" description="Customer accounts across Shopping, DezenFoods and DezenExpress. Contact details are partly hidden." />
      <ListToolbar q={list.q} placeholder="Name, email or phone" onChange={list.set} />
      <Table
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={errorMessage(error)}
        rowKey={(p) => p.id}
        href={(p) => `/people/${p.id}`}
        empty="Nobody matches."
        mobile={(p) => ({ title: p.name, subtitle: `${p.emailMasked}${p.phoneMasked ? ` · ${p.phoneMasked}` : ''}`, status: roles(p) })}
        columns={[
          { header: 'Person', cell: (p) => p.name },
          { header: 'Contact', cell: (p) => <span className="font-mono text-[12.5px] text-ink-2">{p.emailMasked}{p.phoneMasked && ` · ${p.phoneMasked}`}</span> },
          { header: 'Also', cell: roles },
          { header: 'Joined', cell: (p) => <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(p.joinedAt)}</span> },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}

const SHOW_FOR_SECONDS = 60;

/** One person across every service. Full details only on request, with a reason and code, for a minute. */
export function PersonDetail() {
  const { id = '' } = useParams();
  const can = useCan();
  const me = useAppSelector((s) => s.session.access?.email);
  const { data: p, isLoading, error } = usePersonQuery(id);
  const [reveal] = useRevealPersonMutation();
  const [asking, setAsking] = useState(false);
  const [revealed, setRevealed] = useState<{ data: PersonPrivate; at: Date } | null>(null);
  const [left, setLeft] = useState(SHOW_FOR_SECONDS);

  useEffect(() => {
    if (!revealed) return;
    setLeft(SHOW_FOR_SECONDS);
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [revealed]);
  useEffect(() => {
    if (revealed && left <= 0) setRevealed(null);
  }, [left, revealed]);

  const action = p ? (
    revealed ? (
      <Button variant="secondary" onClick={() => setRevealed(null)}>
        <FiEyeOff aria-hidden /> Hide details
      </Button>
    ) : can('read_pii', 'platform') ? (
      <Button onClick={() => setAsking(true)}>
        <FiEye aria-hidden /> Show full details
      </Button>
    ) : (
      <Locked who={WHO.read_pii}>Show full details</Locked>
    )
  ) : undefined;

  return (
    <RecordPage
      back="/people"
      backLabel="People"
      service="platform"
      kind="Person"
      loading={isLoading}
      error={errorMessage(error)}
      title={p?.name}
      badge={p && roles(p)}
      actions={action}
      details={
        p && (
          <>
            {revealed && (
              <p className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-leaf-sm border border-waiting/40 bg-waiting/[0.08] px-3.5 py-2 text-[13px]">
                <span>
                  Shown to {me} at {revealed.at.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })} · logged
                </span>
                <span className="font-mono text-ink-3">hides in {left}s</span>
              </p>
            )}
            <KeyValues
              rows={
                revealed
                  ? [
                      ['Email', <span className="font-mono">{revealed.data.email}</span>],
                      ['Phone', <span className="font-mono">{revealed.data.phone}</span>],
                      ['Address', revealed.data.address],
                      ['Bank', revealed.data.bankName],
                      ['Account number', <span className="font-mono">{revealed.data.accountNumber}</span>],
                      ['Joined', formatDate(p.joinedAt)],
                    ]
                  : [
                      ['Email', <span className="font-mono">{p.emailMasked}</span>],
                      ['Phone', <span className="font-mono">{p.phoneMasked}</span>],
                      ['Joined', formatDate(p.joinedAt)],
                    ]
              }
            />
          </>
        )
      }
    >
      {p && (
        <>
          <Standing p={p} />
          <section>
            <SectionTitle>Orders and trips</SectionTitle>
            <Card>
              {p.activity.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ink-3">Nothing yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {p.activity.map((a) => (
                    <li key={a.ref}>
                      <Link to={a.link} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-5 py-3.5 transition-colors hover:bg-raised">
                        <ServiceGlyph service={a.service} size={13} title />
                        <span className="min-w-0">
                          <span className="block font-mono text-[14px] font-medium">{a.ref}</span>
                          <span className="block text-[12px] text-ink-3">{formatDate(a.at)}</span>
                        </span>
                        <span className="flex flex-col items-end gap-0.5">
                          <Money amount={a.amount} currency={a.currency} className="text-[14px]" />
                          <Status status={a.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
          <section>
            <SectionTitle>Payments</SectionTitle>
            <Card>
              {p.payments.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ink-3">No payments.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {p.payments.map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 text-sm">
                      <span>{x.purpose}</span>
                      <span className="flex items-center gap-3">
                        <Status status={x.status} />
                        <Money amount={x.amount} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
          <CodeSheet
            open={asking}
            title="Show full details"
            eyebrow={p.name}
            summary="Their full email, phone, address and bank details appear for one minute. Your name, the time and your reason are logged, which protects you if anyone asks later."
            actionLabel={`Show ${p.name.split(' ')[0]}'s details`}
            askReason
            onClose={() => setAsking(false)}
            onConfirm={async ({ code, reason }) => {
              const res = await reveal({ id, reason: reason ?? '', code });
              if ('error' in res) return errorMessage(res.error);
              setRevealed({ data: res.data, at: new Date() });
              return null;
            }}
          />
        </>
      )}
    </RecordPage>
  );
}

/** Where they stand with us, first: what we owe them, what is still open, and how often they dispute. */
function Standing({ p }: { p: PersonRecord }) {
  const { owedToThem, openCases, disputes90d, orders } = p.standing;
  const owed = owedToThem.reduce((n, x) => n + x.amount, 0);
  const first = p.name.split(' ')[0];
  return (
    <section aria-label="Where they stand">
      <SectionTitle>Where {first} stands</SectionTitle>
      <Card className="divide-y divide-line">
        <div className="px-5 py-4">
          {owedToThem.length ? (
            <>
              <p className="text-[15px] font-semibold">
                We owe {first} <Money amount={owed} />
              </p>
              <ul className="mt-2 space-y-1.5">
                {owedToThem.map((x) => (
                  <li key={x.link}>
                    <Link to={x.link} className="flex flex-wrap items-baseline justify-between gap-x-4 text-[13.5px] text-ink-2 hover:text-ink">
                      <span>{x.text}</span>
                      <span className="font-mono text-[12.5px]">
                        <Money amount={x.amount} /> · waiting {ageWords(x.since)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="flex items-center gap-2 text-[14px] text-ink-2">
              <StatusShape shape="circle" tone="settled" size={9} />
              We owe {first} nothing.
            </p>
          )}
        </div>
        <div className="px-5 py-4">
          {openCases.length ? (
            <>
              <p className="text-[15px] font-semibold">
                {openCases.length} {openCases.length === 1 ? 'case is' : 'cases are'} still open
              </p>
              <ul className="mt-2 space-y-1.5">
                {openCases.map((x) => (
                  <li key={x.link + x.text}>
                    <Link to={x.link} className="block text-[13.5px] text-ink-2 hover:text-ink">
                      {x.text} <span className="font-mono text-[12.5px] text-ink-3">· {ageWords(x.since)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="flex items-center gap-2 text-[14px] text-ink-2">
              <StatusShape shape="circle" tone="settled" size={9} />
              No open cases.
            </p>
          )}
        </div>
        <p className="px-5 py-3.5 text-[13px] text-ink-3">
          {orders} {orders === 1 ? 'order or trip' : 'orders and trips'} · {disputes90d} {disputes90d === 1 ? 'dispute' : 'disputes'} in the last 90 days
        </p>
      </Card>
    </section>
  );
}
