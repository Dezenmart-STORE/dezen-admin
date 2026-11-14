import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../lib/errors';
import { useClaimMutation, useQueueTopQuery } from '../store/api';
import type { HomeNext, QueueKey, Service } from '../store/types';
import { ServiceGlyph } from './brand';
import { Button, Card, Money, PageHeader } from './ui';

const hoursSince = (iso?: string) => (iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : 0);
/** Age in a sentence: "5 hours", "3 days". */
export const ageWords = (iso?: string) => {
  if (!iso) return '';
  const h = hoursSince(iso);
  return h < 1 ? 'under an hour' : h < 48 ? `${Math.floor(h)} hours` : `${Math.floor(h / 24)} days`;
};
/** Short age for rows: "5h", "3 days". */
export const ageShort = (iso?: string) => {
  if (!iso) return '';
  const h = hoursSince(iso);
  return h < 1 ? 'now' : h < 48 ? `${Math.floor(h)}h` : `${Math.floor(h / 24)} days`;
};
export const isLate = (iso: string | undefined, promiseHours: number) => !!iso && hoursSince(iso) > promiseHours;

/** How long someone has waited, red once past our promise. For list columns. */
export function Waited({ since, promiseHours }: { since?: string; promiseHours: number }) {
  if (!since) return <span className="text-ink-3">—</span>;
  const late = isLate(since, promiseHours);
  return (
    <span className={`whitespace-nowrap font-mono text-[12.5px] ${late ? 'font-semibold text-need' : 'text-ink-3'}`}>
      {ageShort(since)}
      {late && <span className="sr-only"> (past our promise)</span>}
    </span>
  );
}

/**
 * The one thing to take next, person first. "Take it" claims it, so nobody else works it, then opens it.
 * With nothing to take, it says honestly why: nobody waiting, someone else has it all, or view only.
 */
export function NextCard({
  next,
  waiting,
  viewOnly,
  promiseHours = 24,
  clear = ['Nothing is waiting on you.', 'Every rider, vendor and buyer you look after has what they were promised.'],
}: {
  next: HomeNext | null;
  waiting: number;
  viewOnly: boolean;
  promiseHours?: number;
  /** The words when nobody is waiting at all. */
  clear?: [string, string];
}) {
  const navigate = useNavigate();
  const [claim, claiming] = useClaimMutation();
  const [error, setError] = useState('');

  if (!next) {
    const [title, line] =
      waiting === 0
        ? clear
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
  const late = isLate(next.waitingSince, next.promiseHours ?? promiseHours);

  return (
    <section aria-labelledby="next-title" className="@container relative overflow-hidden rounded-leaf border border-line bg-surface">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${late ? 'bg-need' : 'bg-waiting'}`} />
      {/* Sized by the card, not the window: beside an aside the column can be narrow on a wide screen. */}
      <div className="grid gap-6 p-6 @md:p-8 @xl:grid-cols-[minmax(0,1fr)_auto] @xl:items-end">
        <div className="min-w-0">
          <p className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
            <ServiceGlyph service={next.service} size={14} />
            {next.yours ? 'You are on this' : 'Next for you'} · {next.kind}
          </p>
          <h2 id="next-title" className="text-[22px] font-semibold leading-snug tracking-tight text-balance @md:text-[27px]">
            {next.title}
          </h2>
          <p className="mt-2.5 max-w-[60ch] text-[14.5px] leading-relaxed text-ink-2">{next.why}</p>
          {error && <p className="mt-2 text-[13px] text-need">{error}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 @xl:flex-col @xl:items-end">
          {typeof next.amount === 'number' && <Money amount={next.amount} className="text-[22px] @md:text-[26px]" />}
          <Button variant="primary" size="lg" busy={claiming.isLoading} onClick={take} className="min-w-[9rem]">
            {next.yours ? 'Continue' : 'Take it'}
          </Button>
        </div>
      </div>
    </section>
  );
}

/**
 * The top of every queue page, the way Home opens: a sentence about people and our promise,
 * then the one person to take next. The list below stays the page's own.
 */
export function QueueTop({
  queue,
  service,
  eyebrow,
  title,
  who,
  waitFor,
  description,
  clear,
  actions,
}: {
  queue: QueueKey;
  service?: Service;
  eyebrow?: string;
  title: string;
  /** Who waits, one and many: ['rider', 'riders']. */
  who: [string, string];
  /** What they wait for, after "waited past our promise": "to start earning". */
  waitFor?: string;
  description?: ReactNode;
  clear: [string, string];
  actions?: ReactNode;
}) {
  const { data } = useQueueTopQuery(queue, { pollingInterval: 60_000 });
  const n = (k: number) => `${k} ${k === 1 ? who[0] : who[1]}`;
  // A non-breaking hyphen keeps "2‑day" on one line.
  const days = data && data.promiseHours % 24 === 0 ? `${data.promiseHours / 24}‑day` : `${data?.promiseHours}‑hour`;
  const headline = !data ? (
    title
  ) : data.waitingPeople === 0 ? (
    `No ${who[1]} waiting.`
  ) : data.latePeople > 0 ? (
    <>
      <span className="text-need">
        {n(data.latePeople)} {data.latePeople === 1 ? 'has' : 'have'}
      </span>{' '}
      waited past our {days} promise{waitFor ? ` ${waitFor}` : ''}.
    </>
  ) : (
    `${n(data.waitingPeople)} waiting, all inside our ${days} promise.`
  );
  const sub =
    data && data.waitingPeople > 0 ? (
      <>
        {n(data.waitingPeople)} waiting in all{data.oldestAt && <> · the longest for {ageWords(data.oldestAt)}</>}
        {data.claimedBy.map((c) => (
          <span key={c.name} className="text-waiting">
            {' '}
            · {c.name.split(' ')[0]} on {c.count}
          </span>
        ))}
        .
      </>
    ) : null;
  return (
    <>
      <PageHeader
        service={service}
        eyebrow={eyebrow}
        title={title}
        headline={headline}
        description={
          sub || description ? (
            <>
              {sub}
              {sub && description ? <br /> : null}
              {description}
            </>
          ) : undefined
        }
        actions={actions}
      />
      {/* With one person waiting, the list already shows them: the card would only repeat it. */}
      {data && (data.waitingPeople !== 1 || !data.next) && (
        <div className="mb-8">
          <NextCard next={data.next} waiting={data.waitingPeople} viewOnly={!data.canAct} promiseHours={data.promiseHours} clear={clear} />
        </div>
      )}
    </>
  );
}
