import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FiArrowLeft, FiCheck } from 'react-icons/fi';
import { errorMessage, failureOf } from '../lib/errors';
import { formatDate } from '../lib/format';
import { useCan } from '../store';
import { useReviewCaseQuery, useReviewVendorMutation, useVerifyProviderMutation, useVerifyRiderMutation } from '../store/api';
import type { ReviewCase, ReviewKind } from '../store/types';
import { ServiceGlyph, StatusShape } from './brand';
import { ConfirmDialog } from './Dialog';
import { WHO } from './Choice';
import { ageWords, isLate } from './NextCard';
import { Button, Card, ErrorNote, Loading, SectionTitle, Status } from './ui';

const BACK: Record<ReviewKind, { to: string; label: string; waitFor: string }> = {
  rider: { to: '/express/riders', label: 'Riders', waitFor: 'to start riding' },
  vendor: { to: '/food/vendors', label: 'Vendors', waitFor: 'to start selling' },
  provider: { to: '/express/providers', label: 'Delivery companies', waitFor: 'to start delivering' },
};
const REVIEW_PROMISE_H = 48;

/**
 * A newcomer, reviewed as a case: what they sent on one side, what to check it against on the other.
 * Approve stays locked until every check is ticked, so nobody approves a rider they have not looked at.
 * The bare "Reject" becomes "Ask them to fix", which tells them why and lets them send it again.
 */
export function ReviewCasePage({ kind }: { kind: ReviewKind }) {
  const { id = '' } = useParams();
  const { data: c, isLoading, error } = useReviewCaseQuery({ kind, id });
  const back = BACK[kind];
  return (
    <>
      <Link to={`${back.to}?status=pending`} data-nav-back className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink">
        <FiArrowLeft aria-hidden /> {back.label} to review
      </Link>
      {isLoading ? <Loading /> : error || !c ? <ErrorNote>{errorMessage(error) || 'This record could not load.'}</ErrorNote> : <Case c={c} />}
    </>
  );
}

function Case({ c }: { c: ReviewCase }) {
  const can = useCan();
  const mayDecide = can('verify', c.service);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [asking, setAsking] = useState<'fix' | 'suspend' | null>(null);
  const [approveError, setApproveError] = useState('');
  const [reviewVendor, v] = useReviewVendorMutation();
  const [verifyRider, r] = useVerifyRiderMutation();
  const [verifyProvider, p] = useVerifyProviderMutation();
  const busy = v.isLoading || r.isLoading || p.isLoading;
  useEffect(() => setTicked(new Set()), [c.id, c.status]);

  const pending = c.status === 'pending' || c.status === 'rejected';
  const done = ticked.size;
  const all = c.checks.length;
  const first = c.name.split(' ')[0];
  const late = isLate(c.appliedAt, REVIEW_PROMISE_H);

  const decide = async (status: 'approve' | 'reject' | 'suspend', reason?: string) => {
    const checks = [...ticked];
    if (c.kind === 'vendor') return reviewVendor({ id: c.id, status: status === 'approve' ? 'approved' : status === 'reject' ? 'rejected' : 'suspended', reason, checks });
    if (c.kind === 'rider') return verifyRider({ id: c.id, status: status === 'approve' ? 'verified' : 'rejected', reason, checks });
    return verifyProvider({ id: c.id, status: status === 'approve' ? 'verified' : 'rejected', reason, checks });
  };
  const approve = async () => {
    setApproveError('');
    const res = await decide('approve');
    if ('error' in res && res.error) setApproveError(errorMessage(res.error as never));
  };
  const toggle = (id: string) =>
    setTicked((t) => {
      const n = new Set(t);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <header className="mb-7 border-b border-line pb-6">
        <p className="mb-2.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
          <ServiceGlyph service={c.service} size={15} />
          {c.kind === 'rider' ? 'Rider' : c.kind === 'vendor' ? 'Kitchen' : 'Delivery company'}
          {c.status === 'pending' ? ' to check' : ''}
        </p>
        <h1 className="max-w-[30ch] text-[26px] font-semibold leading-tight tracking-tight text-balance sm:text-[32px]">
          {c.status === 'pending' ? (
            <>
              {c.name} has waited <span className={late ? 'text-need' : ''}>{ageWords(c.appliedAt)}</span> {BACK[c.kind].waitFor}
            </>
          ) : (
            c.name
          )}
        </h1>
        <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14.5px] text-ink-2">
          <span>{c.summary}</span>
          <span className="text-ink-3">· applied {formatDate(c.appliedAt)}</span>
          {c.status !== 'pending' && <Status status={c.status} />}
        </p>
        {c.rejectionReason && c.status !== 'approved' && c.status !== 'verified' && (
          <p className="mt-3 max-w-[62ch] border-l-2 border-line pl-3 text-[13.5px] text-ink-2">
            {c.status === 'suspended' ? 'Suspended' : 'Asked to fix'}: “{c.rejectionReason}”
          </p>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section aria-label="What they sent" className="min-w-0 space-y-6">
          <div>
            <SectionTitle>What they sent</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              {c.documents.map((d, i) => (
                <figure key={d.id} className={i === 0 ? 'sm:col-span-2' : ''}>
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-leaf border border-line bg-raised">
                      <img src={d.url} alt={d.label} className={`${i === 0 ? 'aspect-[2.4]' : 'aspect-[1.6]'} w-full object-cover`} />
                    </a>
                  ) : (
                    <div className={`grid ${i === 0 ? 'aspect-[2.4]' : 'aspect-[1.6]'} place-items-center rounded-leaf border border-dashed border-line bg-raised px-4 text-center`}>
                      <span>
                        <span className="block text-[14px] font-semibold text-ink-2">{d.label}</span>
                        <span className="mt-1 block text-[12px] text-ink-3">The photo shows here once the backend sends it</span>
                      </span>
                    </div>
                  )}
                  <figcaption className="mt-1.5 flex justify-between gap-3 text-[12.5px]">
                    <span className="font-semibold">{d.label}</span>
                    {d.caption && <span className="truncate font-mono text-ink-3">{d.caption}</span>}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
          <div>
            <SectionTitle>What they typed</SectionTitle>
            <Card className="p-5">
              <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-6 gap-y-2.5 text-sm">
                {c.facts.map((f) => (
                  <div key={f.label} className="contents">
                    <dt className="text-ink-3">{f.label}</dt>
                    <dd className="min-w-0 break-words font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </section>

        <aside aria-label="Checks and decision" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <SectionTitle aside={pending ? <span className="font-mono text-[12px] text-ink-3">{done} of {all}</span> : undefined}>
            {pending ? 'Check before you approve' : 'Checked'}
          </SectionTitle>
          <Card className="p-2">
            <ul>
              {c.checks.map((k) => {
                const on = ticked.has(k.id) || !pending;
                return (
                  <li key={k.id}>
                    <label className={`flex gap-3 rounded-leaf-sm px-3 py-3 ${pending && mayDecide ? 'cursor-pointer hover:bg-raised' : ''}`}>
                      <input type="checkbox" aria-label={k.label} className="peer sr-only" checked={on} disabled={!pending || !mayDecide} onChange={() => toggle(k.id)} />
                      <span
                        aria-hidden
                        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink-2 ${on ? 'border-settled bg-settled text-ground' : 'border-ink-3'}`}
                      >
                        {on && <FiCheck className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium">{k.label}</span>
                        {k.expected && <span className="mt-0.5 block break-words font-mono text-[12.5px] text-ink-3">{k.expected}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="mt-4 space-y-2.5">
            {!mayDecide ? (
              <p className="flex items-center gap-2 text-[13px] text-ink-3">
                <StatusShape shape="ring" tone="quiet" size={9} />
                {WHO.verify} decide. You can read everything here.
              </p>
            ) : pending ? (
              <>
                <Button variant="primary" size="lg" className="w-full" disabled={done < all} busy={busy && !asking} onClick={approve}>
                  {done < all ? `Approve ${first} · ${all - done} ${all - done === 1 ? 'check' : 'checks'} left` : `Approve ${first}`}
                </Button>
                <ErrorNote>{approveError}</ErrorNote>
                <Button size="lg" className="w-full" onClick={() => setAsking('fix')}>
                  Ask {first} to fix something
                </Button>
              </>
            ) : c.kind === 'vendor' && c.status === 'approved' ? (
              <Button variant="danger" className="w-full" onClick={() => setAsking('suspend')}>
                Suspend {c.name}
              </Button>
            ) : null}
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={!!asking}
        title={asking === 'suspend' ? `Suspend ${c.name}` : `Ask ${first} to fix something`}
        summary={
          asking === 'suspend'
            ? 'Their menu is hidden and they cannot take orders until approved again.'
            : `${first} sees your reason in the app and can send it again. Nothing is approved meanwhile.`
        }
        actionLabel={asking === 'suspend' ? 'Suspend' : `Send to ${first}`}
        askReason
        reasonHint={asking === 'suspend' ? 'The vendor sees this.' : `Say exactly what to fix, e.g. "The plate in the photo is not readable".`}
        danger={asking === 'suspend'}
        onClose={() => setAsking(null)}
        onConfirm={async (reason) => failureOf(await decide(asking === 'suspend' ? 'suspend' : 'reject', reason))}
      />
    </>
  );
}
