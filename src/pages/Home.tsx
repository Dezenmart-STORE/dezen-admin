import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FiArrowRight, FiRefreshCw } from 'react-icons/fi';
import { errorMessage } from '../lib/errors';
import { useAppSelector } from '../store';
import { useClaimMutation, useHomeQuery, useSearchQuery } from '../store/api';
import type { HomeGroup, HomeNext, HomeRow, HomeService, HomeToday, SearchResult } from '../store/types';
import { LivingMark, SERVICE_NAME, ServiceGlyph, StatusShape } from '../components/brand';
import { Button, Card, Empty, ErrorNote, Loading, Money, PageHeader } from '../components/ui';
import { TopSearch } from '../components/Layout';

const hoursSince = (iso?: string) => (iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : 0);
/** Short age for rows: "5h", "3 days". */
const age = (iso?: string) => {
  if (!iso) return '';
  const h = hoursSince(iso);
  return h < 1 ? 'now' : h < 48 ? `${Math.floor(h)}h` : `${Math.floor(h / 24)} days`;
};
/** Age in a sentence: "5 hours", "3 days". */
const ageWords = (iso?: string) => {
  if (!iso) return '';
  const h = hoursSince(iso);
  return h < 1 ? 'under an hour' : h < 48 ? `${Math.floor(h)} hours` : `${Math.floor(h / 24)} days`;
};
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const firstName = (email?: string) => {
  const n = email?.split('@')[0].split(/[._-]/)[0];
  return n && n !== 'you' ? n.charAt(0).toUpperCase() + n.slice(1) : '';
};
const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

/**
 * Home is the person's shift: the one thing to take next, the work grouped by what they will do,
 * and, beside it, the living mark and the people settled today. From the council review.
 */
export function Home() {
  const email = useAppSelector((s) => s.session.access?.email);
  const { data, isLoading, isFetching, error, refetch, fulfilledTimeStamp } = useHomeQuery(undefined, { pollingInterval: 60_000 });
  // Keep "Updated n min ago" honest between polls.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorNote>{errorMessage(error) || 'Home could not load.'}</ErrorNote>;

  const name = firstName(email);
  const minutes = fulfilledTimeStamp ? Math.floor((Date.now() - fulfilledTimeStamp) / 60_000) : 0;

  return (
    <>
      <header className="mb-9 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <p className="text-[15px] text-ink-2">
            {greeting()}
            {name ? `, ${name}` : ''}.
          </p>
          <h1 className="mt-2 max-w-[24ch] text-[28px] font-semibold leading-[1.12] tracking-tight text-balance sm:text-[38px]">
            {data.waitingPeople === 0 ? (
              'Nobody is waiting on us.'
            ) : data.latePeople > 0 ? (
              <>
                <span className="text-need">{data.latePeople === 1 ? '1 person has' : `${data.latePeople} people have`}</span> waited past our promise.
              </>
            ) : (
              'Everyone waiting is still inside our promise.'
            )}
          </h1>
          {data.waitingPeople > 0 && (
            <p className="mt-3 text-[15px] text-ink-2">
              {data.waitingPeople} waiting in all{data.oldestAt && <> · the longest for {ageWords(data.oldestAt)}</>}.
            </p>
          )}
        </div>
        <button type="button" onClick={() => refetch()} className="flex cursor-pointer items-center gap-2 font-mono text-[12px] text-ink-3 transition-colors hover:text-ink">
          <FiRefreshCw aria-hidden className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          {minutes < 1 ? 'Up to date' : `Updated ${minutes} min ago`}
        </button>
      </header>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-16">
        <div className="min-w-0 space-y-11">
          <NextCard next={data.next} waiting={data.waitingPeople} viewOnly={data.groups.some((g) => g.rows.some((r) => !r.canAct))} />
          {data.groups.map((g) => (
            <Group key={g.verb} group={g} />
          ))}
        </div>
        <aside className="min-w-0 space-y-11 lg:sticky lg:top-24 lg:self-start">
          <MarkPanel services={data.services} latePeople={data.latePeople} />
          <Today today={data.today} me={email} />
        </aside>
      </div>
    </>
  );
}

/** The one thing to take next, person first. "Take it" claims it, so nobody else works it, then opens it. */
function NextCard({ next, waiting, viewOnly }: { next: HomeNext | null; waiting: number; viewOnly: boolean }) {
  const navigate = useNavigate();
  const [claim, claiming] = useClaimMutation();
  const [error, setError] = useState('');

  if (!next) {
    // Only claim "everyone has what they were promised" when it is true.
    const [title, line] =
      waiting === 0
        ? ['Nothing is waiting on you.', 'Every rider, vendor and buyer you look after has what they were promised.']
        : viewOnly
          ? ['Nothing here needs you to act.', 'The people below are with teammates who can pay, rule or approve. Open any row to see where it stands when someone asks you.']
          : ['Everything waiting is already taken.', 'A teammate is on each one. Open a row to see who has it.'];
    return (
      <Card className="flex items-center gap-5 p-6 sm:p-7">
        <span aria-hidden className="grid shrink-0 grid-cols-2 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-3 w-3 rounded-full ${waiting === 0 ? 'bg-settled' : 'border-2 border-ink-3'}`} />
          ))}
        </span>
        <div>
          <p className="text-[18px] font-semibold">{title}</p>
          <p className="mt-1 text-[14px] text-ink-2">{line}</p>
        </div>
      </Card>
    );
  }

  const take = async () => {
    setError('');
    if (next.claim && !next.yours) {
      const res = await claim(next.claim);
      if ('error' in res) return setError(errorMessage(res.error));
    }
    navigate(next.link);
  };
  const late = hoursSince(next.waitingSince) > 24;

  return (
    <section aria-labelledby="next-title" className="relative overflow-hidden rounded-leaf border border-line bg-surface">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${late ? 'bg-need' : 'bg-waiting'}`} />
      <div className="grid gap-6 p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-8">
        <div className="min-w-0">
          <p className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
            <ServiceGlyph service={next.service} size={14} />
            {next.yours ? 'You are on this' : 'Next for you'} · {next.kind}
          </p>
          <h2 id="next-title" className="text-[22px] font-semibold leading-snug tracking-tight text-balance sm:text-[27px]">
            {next.title}
          </h2>
          <p className="mt-2.5 max-w-[60ch] text-[14.5px] leading-relaxed text-ink-2">{next.why}</p>
          {error && <p className="mt-2 text-[13px] text-need">{error}</p>}
        </div>
        <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
          {typeof next.amount === 'number' && <Money amount={next.amount} className="text-[22px] sm:text-[26px]" />}
          <Button variant="primary" size="lg" busy={claiming.isLoading} onClick={take} className="min-w-[9rem]">
            {next.yours ? 'Continue' : 'Take it'}
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Work grouped by what the person will do: approve, pay, rule, review. */
function Group({ group }: { group: HomeGroup }) {
  return (
    <section aria-label={group.label}>
      <h2 className="mb-1 flex items-baseline justify-between gap-4 border-b border-line pb-3">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-3">{group.label}</span>
        <span className="text-[14px] font-semibold">{group.summary}</span>
      </h2>
      <ul>
        {group.rows.map((r) => (
          <Row key={r.key} row={r} />
        ))}
      </ul>
    </section>
  );
}

function Row({ row }: { row: HomeRow }) {
  return (
    <li>
      <Link
        to={row.link}
        data-nav-row
        className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line px-1 py-4 transition-colors hover:bg-surface focus-visible:bg-surface sm:grid-cols-[auto_minmax(0,1fr)_auto_4.5rem_auto] sm:px-3"
      >
        <ServiceGlyph service={row.service} size={18} title />
        <span className="min-w-0">
          <span className="flex items-start gap-2 text-[15px] font-semibold leading-[22px]">
            {row.late && (
              <span className="mt-[7px] shrink-0">
                <StatusShape shape="petal" tone="need" size={8} />
                <span className="sr-only">Past our promise: </span>
              </span>
            )}
            <span className="min-w-0">{row.title}</span>
          </span>
          <span className="mt-0.5 block text-[13px] text-ink-3">
            {row.detail}
            {row.claimedBy.map((c) => (
              <span key={c.name} className="text-waiting">
                {' '}
                · {c.name.split(' ')[0]} on {c.count}
              </span>
            ))}
            {!row.canAct && <span> · view only</span>}
            <span className={`font-mono sm:hidden ${row.late ? 'text-need' : ''}`}> · {age(row.oldestAt)}</span>
          </span>
        </span>
        <span className="text-right text-[15px]">
          {typeof row.amount === 'number' ? <Money amount={row.amount} /> : <span className="font-mono font-medium">{row.count}</span>}
        </span>
        <span className={`hidden text-right font-mono text-[12.5px] sm:block ${row.late ? 'font-semibold text-need' : 'text-ink-3'}`}>{age(row.oldestAt)}</span>
        <FiArrowRight aria-hidden className="hidden h-4 w-4 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink sm:block" />
      </Link>
    </li>
  );
}

/** The living mark, and what each shape says in words. */
function MarkPanel({ services, latePeople }: { services: HomeService[]; latePeople: number }) {
  return (
    <section aria-labelledby="mark-title">
      <h2 id="mark-title" className="mb-6 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-3">
        The four services, right now
      </h2>
      <div className="flex justify-center lg:justify-start">
        <LivingMark services={services} latePeople={latePeople} size={228} />
      </div>
      <ul className="mt-7 space-y-2.5">
        {services.map((s) => (
          <li key={s.service} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-[13.5px]">
            <ServiceGlyph service={s.service} size={14} />
            <span className={s.people ? '' : 'text-ink-3'}>{SERVICE_NAME[s.service]}</span>
            <span className={`text-right ${s.late ? 'font-semibold text-need' : s.people ? 'text-ink-2' : 'text-settled'}`}>
              {!s.people ? 'Clear' : s.owed ? `${naira(s.owed)} owed${s.late ? ' · late' : ''}` : `${s.people} waiting${s.late ? ' · late' : ''}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
        Each shape grows with what its service owes people. A red halo means someone there is past their promise; an outline means clear. The centre counts everyone past their promise.
      </p>
    </section>
  );
}

/** The people settled today: a receipt, not a score. */
function Today({ today, me }: { today: HomeToday; me?: string }) {
  const max = Math.max(1, ...today.week.flatMap((d) => [d.cleared, d.added]));
  const who = (email: string) => (email === me ? 'you' : email.split('@')[0].split(/[._-]/)[0]);
  return (
    <section aria-labelledby="today-title">
      <h2 id="today-title" className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-3">
        Today
      </h2>
      <p className="text-[26px] font-semibold leading-tight tracking-tight">
        {today.team.people} {today.team.people === 1 ? 'person' : 'people'} settled
      </p>
      <p className="mt-1 text-[14px] text-ink-2">
        <Money amount={today.team.amount} /> sent by the team · {today.mine.people} by you
      </p>
      {today.settled.length > 0 && (
        <ul className="mt-5 space-y-3">
          {today.settled.map((x, i) => (
            <li key={i} className="grid grid-cols-[12px_minmax(0,1fr)_auto] items-baseline gap-3 text-[13.5px]">
              <span aria-hidden className="block h-2.5 w-2.5 rounded-full bg-settled" />
              <span className="min-w-0">
                {x.text}
                <span className="block text-[11.5px] text-ink-3">
                  {who(x.by)} · {new Date(x.at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </span>
              {typeof x.amount === 'number' && <Money amount={x.amount} currency={x.currency} className="text-[12.5px] text-ink-2" />}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-7 border-t border-line pt-4">
        <p className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-2">
          <span>Settled vs new, this week</span>
          <span className="flex items-center gap-3 text-[11.5px] text-ink-3">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-settled" /> settled
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-ink-3/50" /> new
            </span>
          </span>
        </p>
        <div className="mt-3 grid grid-cols-7 gap-2" role="img" aria-label={today.week.map((d) => `${d.day}: ${d.cleared} settled, ${d.added} new`).join('; ')}>
          {today.week.map((d) => (
            <div key={d.day} className="flex flex-col items-center gap-1.5">
              <div className="flex h-16 w-full items-end justify-center gap-[3px]">
                <span className="w-1/2 max-w-[9px] rounded-t-[3px] bg-settled" style={{ height: `${Math.max(2, (d.cleared / max) * 100)}%` }} />
                <span className="w-1/2 max-w-[9px] rounded-t-[3px] bg-ink-3/50" style={{ height: `${Math.max(2, (d.added / max) * 100)}%` }} />
              </div>
              <span className={`text-[10.5px] ${d.day === 'Today' ? 'font-semibold text-ink' : 'text-ink-3'}`}>{d.day}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
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
                    <Link to={r.link} data-nav-row className="group flex items-center gap-4 border-b border-line px-1 py-3.5 transition-colors hover:bg-surface sm:px-3">
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
