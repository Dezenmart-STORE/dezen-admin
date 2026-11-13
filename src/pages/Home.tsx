import { Link, useSearchParams } from 'react-router-dom';
import { FiArrowRight } from 'react-icons/fi';
import { errorMessage } from '../lib/errors';
import { useAppSelector } from '../store';
import { useQueuesQuery, useSearchQuery } from '../store/api';
import type { QueueItem, SearchResult, Service } from '../store/types';
import { Mark, SERVICE_NAME, SERVICE_SLOT, ServiceGlyph, StatusShape } from '../components/brand';
import { Card, Empty, ErrorNote, Loading, Money, PageHeader } from '../components/ui';
import { TopSearch } from '../components/Layout';

const hoursSince = (iso?: string) => (iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : 0);
const age = (iso?: string) => {
  if (!iso) return '';
  const h = hoursSince(iso);
  return h < 1 ? 'under an hour' : h < 48 ? `${Math.floor(h)}h` : `${Math.floor(h / 24)} days`;
};
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
/** Money waiting more than a day, or anything waiting more than two, is late. */
const late = (q: QueueItem) => hoursSince(q.oldestAt) > (q.urgent ? 24 : 48);

/**
 * Home. The mark is live: a service's shape is filled when it needs someone, outlined when clear.
 * Beside it, the naira waiting on a person. Below, one list of work ranked by money then age.
 */
export function Home() {
  const email = useAppSelector((s) => s.session.access?.email);
  const { data, isLoading, error } = useQueuesQuery(undefined, { pollingInterval: 60_000 });

  if (isLoading) return <Loading />;
  if (error) return <ErrorNote>{errorMessage(error)}</ErrorNote>;

  const queues = data ?? [];
  const open = queues
    .filter((q) => q.count > 0)
    .sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || (b.amountAtStake ?? 0) - (a.amountAtStake ?? 0) || (a.oldestAt ?? '').localeCompare(b.oldestAt ?? ''));
  const clear = queues.filter((q) => q.count === 0);
  const atStake = open.reduce((s, q) => s + (q.amountAtStake ?? 0), 0);
  const items = open.reduce((s, q) => s + q.count, 0);
  const oldest = open.map((q) => q.oldestAt).filter(Boolean).sort()[0];
  const busy = new Set(open.map((q) => q.service));
  const covered = new Set(queues.map((q) => q.service));
  const lit = Object.fromEntries((['shopping', 'express', 'food', 'platform'] as Service[]).map((s) => [SERVICE_SLOT[s], busy.has(s)]));
  const firstName = email?.split('@')[0].split(/[._-]/)[0];

  return (
    <>
      <p className="mb-6 text-[15px] text-ink-2">
        {greeting()}
        {firstName && firstName !== 'you' ? `, ${firstName.charAt(0).toUpperCase()}${firstName.slice(1)}` : ''}.
      </p>

      <section className="mb-8 grid items-center gap-6 border-b border-line pb-8 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-10">
        <Mark size={112} lit={lit} label={busy.size ? `${[...busy].map((s) => SERVICE_NAME[s]).join(', ')} need someone` : 'Everything is settled'} />
        <div className="min-w-0">
          {items ? (
            <>
              <p className="font-mono text-[40px] font-semibold leading-none tracking-tight sm:text-[52px]">
                <Money amount={atStake} />
              </p>
              <p className="mt-3 text-[15px] text-ink-2">
                waiting on someone across <span className="font-semibold text-ink">{items} items</span>
                {oldest && (
                  <>
                    {' '}
                    · oldest <span className={hoursSince(oldest) > 24 ? 'font-semibold text-need' : ''}>{age(oldest)}</span>
                  </>
                )}
              </p>
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-ink-3">
                {(['food', 'express', 'shopping', 'platform'] as Service[])
                  .filter((s) => covered.has(s))
                  .map((s) => (
                    <li key={s} className="flex items-center gap-1.5">
                      <ServiceGlyph service={s} size={14} />
                      {SERVICE_NAME[s]} {busy.has(s) ? 'needs you' : 'is clear'}
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <>
              <p className="font-display text-[28px] leading-tight">Everything is settled</p>
              <p className="mt-2 text-[15px] text-ink-2">No money is waiting and no one needs a decision. Every shape is clear.</p>
            </>
          )}
        </div>
      </section>

      {!queues.length ? (
        <p className="text-sm text-ink-2">Your access has no queues. Use the menu to find what you can see.</p>
      ) : (
        <>
          {open.length > 0 && (
            <>
              <h2 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-3">Waiting on someone · money first</h2>
              <ol className="border-t border-line">
                {open.map((q) => (
                  <li key={q.key}>
                    <Link
                      to={q.link}
                      className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line px-1 py-4 transition-colors hover:bg-surface sm:grid-cols-[auto_minmax(0,1fr)_auto_5.5rem_auto] sm:px-3"
                    >
                      <span className="flex items-center">
                        <ServiceGlyph service={q.service} size={22} title />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-[15px] font-semibold">
                          {q.urgent && <StatusShape shape="petal" tone="need" size={8} />}
                          {q.label}
                        </span>
                        {q.detail && <span className="mt-0.5 block truncate text-[13px] text-ink-3">{q.detail}</span>}
                      </span>
                      <span className="text-right text-[15px]">
                        {typeof q.amountAtStake === 'number' ? <Money amount={q.amountAtStake} /> : <span className="font-mono font-medium">{q.count}</span>}
                      </span>
                      <span className={`hidden text-right font-mono text-[12.5px] sm:block ${late(q) ? 'font-semibold text-need' : 'text-ink-3'}`}>{age(q.oldestAt)}</span>
                      <FiArrowRight aria-hidden className="hidden h-4 w-4 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink sm:block" />
                    </Link>
                  </li>
                ))}
              </ol>
            </>
          )}
          {clear.length > 0 && (
            <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[13px] text-ink-3 sm:px-3">
              <StatusShape shape="circle" tone="settled" size={9} />
              <span className="font-medium text-settled">Clear:</span>
              {clear.map((q) => q.label).join(' · ')}
            </p>
          )}
        </>
      )}
    </>
  );
}

const KIND: Record<SearchResult['kind'], string> = { person: 'People', order: 'Orders', booking: 'Trips', payment: 'Payments', vendor: 'Vendors', rider: 'Riders' };

/** One box for everything: names, emails, phones, order and trip references, payment references. */
export function Search() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const { data, isFetching, error } = useSearchQuery(q, { skip: q.trim().length < 2 });
  const groups = Object.entries(KIND)
    .map(([kind, label]) => ({ label, items: (data ?? []).filter((r) => r.kind === kind) }))
    .filter((g) => g.items.length);
  return (
    <>
      <div className="mb-6 md:hidden">
        <TopSearch autoFocus={!q} />
      </div>
      <PageHeader title={q ? `“${q}”` : 'Search'} description="A name, phone number, email, order or trip reference, or payment reference." />
      {q.trim().length < 2 ? (
        <p className="text-sm text-ink-2">Type at least two characters.</p>
      ) : isFetching ? (
        <Loading label="Searching" />
      ) : error ? (
        <ErrorNote>{errorMessage(error)}</ErrorNote>
      ) : !groups.length ? (
        <Card>
          <Empty>Nothing matches “{q}”. Check the spelling, or try a phone number or reference.</Empty>
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-3">
                {g.label} <span className="text-ink-3/70">· {g.items.length}</span>
              </h2>
              <ul className="border-t border-line">
                {g.items.map((r) => (
                  <li key={`${r.kind}-${r.id}`}>
                    <Link to={r.link} className="group flex items-center gap-4 border-b border-line px-1 py-3.5 transition-colors hover:bg-surface sm:px-3">
                      <ServiceGlyph service={r.service} size={14} title />
                      <span className="min-w-0 flex-1">
                        <span className={`block font-semibold ${r.kind === 'order' || r.kind === 'booking' || r.kind === 'payment' ? 'font-mono text-[14px]' : 'text-[15px]'}`}>{r.title}</span>
                        <span className="block truncate text-[13px] text-ink-3">{r.subtitle}</span>
                      </span>
                      <FiArrowRight aria-hidden className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
