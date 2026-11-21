import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiCheck } from 'react-icons/fi';
import { errorMessage, failureOf } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useCan } from '../../store';
import {
  useAllowSellerMutation,
  useLazyProductsQuery,
  useMarkProductReviewedMutation,
  useProductQuery,
  useRemoveProductMutation,
  useRestoreProductMutation,
  useSetProductVisibilityMutation,
} from '../../store/api';
import type { ListingSnapshot, ProductDecision, ProductDetail, RemovalReason, ReviewCheck } from '../../store/types';
import { ServiceGlyph, StatusShape } from '../../components/brand';
import { ConfirmDialog, Dialog } from '../../components/Dialog';
import { WHO } from '../../components/Choice';
import { Button, Card, ErrorNote, Field, Loading, Money, SectionTitle, Status, moneyWords } from '../../components/ui';

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

/**
 * What a reviewer confirms before calling a listing fine. The backend checks the same ids. Each check also
 * shows what to look for in this listing's category, and the price check shows the usual price when known.
 */
const CHECKS: { id: ReviewCheck; label: string; hint: (p: ProductDetail) => string; fails: RemovalReason }[] = [
  { id: 'photos', label: 'The photos show the real item', hint: () => 'Not stock pictures, screenshots or photos taken from another shop.', fails: 'photos' },
  { id: 'details', label: 'The name and description match the photos', hint: () => 'Same item, same brand, same size or quantity.', fails: 'misleading' },
  {
    id: 'price',
    label: 'The price is believable',
    hint: (p) =>
      p.guide.price
        ? `Listed at ${moneyWords(p.price, p.currency, p.priceNgn)}. Usually ${naira(p.guide.price.low)} to ${naira(p.guide.price.high)} for ${p.guide.price.item}.`
        : `Listed at ${moneyWords(p.price, p.currency, p.priceNgn)}. Far below the usual price is a common sign of a scam.`,
    fails: 'scam',
  },
  { id: 'allowed', label: 'It is allowed on Dezenmart', hint: () => 'No fakes or copies, weapons, drugs, medicines or health promises.', fails: 'not_allowed' },
  { id: 'brand', label: 'It looks right on Dezenmart', hint: () => 'No phone numbers or links to deal elsewhere, no watermarks, nothing explicit or offensive.', fails: 'photos' },
];

/**
 * The removal reason the screen suggests: what the flags point at first, then the first check a reviewer
 * left unticked after ticking others. Staff can always change it.
 */
const suggestReason = (p: ProductDetail, ticked: Set<string>): { reason: RemovalReason; why: string } | null => {
  if (p.flags[0]) return { reason: p.flags[0].reason, why: 'Picked from what was flagged.' };
  const unticked = CHECKS.find((c) => !ticked.has(c.id));
  if (ticked.size > 0 && unticked) return { reason: unticked.fails, why: `Picked because “${unticked.label.toLowerCase()}” is not ticked.` };
  return null;
};

/** The reasons a seller can be given, with a first draft of the message that staff can change. */
/** Reasons that put buyers who already paid at risk: their orders are held and refunded, not paid out. */
export const HOLDS_ORDERS: RemovalReason[] = ['scam', 'not_allowed'];

const listWords = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export const REMOVAL: Record<RemovalReason, { label: string; draft: string }> = {
  scam: {
    label: 'Looks like a scam or a fake',
    draft: 'This listing shows signs of a scam: the price, photos or details do not add up for a genuine item. To protect buyers we have removed it.',
  },
  not_allowed: {
    label: 'Not allowed on Dezenmart',
    draft: 'This item is not allowed on Dezenmart. Copies of branded goods, weapons, drugs, medicines and health promises cannot be sold here.',
  },
  misleading: {
    label: 'Wrong or misleading details',
    draft: 'The name, description or price of this listing does not match the item in the photos. You are welcome to list it again with details that match.',
  },
  photos: {
    label: 'Photos break our rules',
    draft: 'The photos on this listing do not meet our rules: use clear photos of the real item, without phone numbers, watermarks or other shops’ pictures. You are welcome to list it again with new photos.',
  },
  other: { label: 'Something else', draft: '' },
};

export function ProductReview() {
  const { id = '' } = useParams();
  const { data: p, isLoading, error } = useProductQuery(id);
  return (
    <>
      <Link to="/shopping/products?status=review" data-nav-back className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink">
        <FiArrowLeft aria-hidden /> Products
      </Link>
      {isLoading ? <Loading /> : error || !p ? <ErrorNote>{errorMessage(error) || 'This listing could not load.'}</ErrorNote> : <Listing p={p} />}
    </>
  );
}

function Listing({ p }: { p: ProductDetail }) {
  const can = useCan();
  const navigate = useNavigate();
  const mayDecide = can('verify', 'shopping');
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<'hide' | 'remove' | 'keep' | 'allow' | null>(null);
  const [fineError, setFineError] = useState('');
  const [markReviewed, marking] = useMarkProductReviewedMutation();
  const [setVisible] = useSetProductVisibilityMutation();
  const [loadQueue] = useLazyProductsQuery();
  const [allowSeller] = useAllowSellerMutation();
  const isOwner = can('staff_admin', 'shopping');
  const stopped = p.seller.stopped;
  useEffect(() => setTicked(new Set()), [p.id]);

  const removed = !!p.removed;
  const sellerFirst = p.seller.name.split(' ')[0];
  const done = ticked.size;
  const all = CHECKS.length;
  const reported = p.reports > 0 && p.visible;
  const fixed = !p.visible && !!p.fixedAt;
  // Back from a removal an owner undid, not from the seller fixing it.
  const restored = fixed && p.history[0]?.kind === 'restored';
  const changed = p.visible && !reported && !!p.changedAt && p.needsLook && !!p.reviewedAt;
  const open = p.needsLook || !p.visible;
  const state = removed
    ? 'Removed listing'
    : reported
      ? 'Reported listing'
      : restored
        ? 'Hidden · removal undone, to check again'
        : fixed
        ? 'Hidden · the seller says it’s fixed'
        : !p.visible
          ? 'Hidden listing'
          : changed
            ? 'Changed since it was looked over'
            : p.needsLook
              ? 'Listing to look over'
              : 'Listing';
  // What the main button does, said plainly. Every path that clears a listing goes through the checks.
  const clearLabel = reported ? 'Reports don’t hold up, keep it' : !p.visible ? 'It’s fixed, put it back on sale' : 'It’s fine, keep it on sale';
  const queue = reported ? 'reported' : 'review';
  const backTo = `/shopping/products?status=${queue}`;
  /** After a decision, open the next listing in the same queue, so a reviewer never hunts for it. */
  const goNext = async () => {
    const next = await loadQueue({ status: queue, page: 1 }).unwrap().catch(() => null);
    const id = next?.items.find((x) => x.id !== p.id)?.id;
    navigate(id ? `/shopping/products/${id}` : backTo);
  };
  const flaggedChecks = new Set(p.flags.map((f) => f.check));

  const toggle = (id: string) =>
    setTicked((t) => {
      const n = new Set(t);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const clear = async (note?: string) => {
    setFineError('');
    const failure = failureOf(await markReviewed({ id: p.id, checks: [...ticked], note }));
    if (!failure) await goNext();
    return failure;
  };
  // Clearing buyer reports needs a word on why, kept for staff; everything else clears straight away.
  const fine = async () => {
    if (reported) return setSheet('keep');
    const failure = await clear();
    if (failure) setFineError(failure);
  };

  return (
    <>
      <header className="mb-7 border-b border-line pb-6">
        <p className="mb-2.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
          <ServiceGlyph service="shopping" size={15} />
          {state}
        </p>
        <h1 className="max-w-[34ch] text-[26px] font-semibold leading-tight tracking-tight text-balance sm:text-[32px]">{p.name}</h1>
        <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14.5px] text-ink-2">
          <Money amount={p.price} currency={p.currency} ngn={p.priceNgn} />
          <span className="text-ink-3">
            · {p.category} · {p.stock} in stock · listed {formatDate(p.createdAt)} by{' '}
            <Link to={`/people/${p.seller.id}`} className="text-ink-2 underline-offset-4 hover:underline">
              {p.seller.name}
            </Link>
          </span>
          {removed ? <Status status="cancelled" word="Removed" /> : p.visible ? <Status status="approved" word="On sale" /> : <Status status="cancelled" word="Hidden" />}
        </p>
        {(changed || fixed) && (
          <div className="mt-4 max-w-[68ch] rounded-leaf-sm border border-waiting/40 bg-waiting/[0.08] px-4 py-3 text-[14px]">
            <p className="font-semibold">
              {restored
                ? `${p.history[0].by} undid the removal · ${formatDate(p.history[0].at)}`
                : fixed
                  ? `${sellerFirst} says it’s fixed`
                  : `${sellerFirst} changed it after it was looked over`}
              {!restored && p.changes?.length ? `: new ${listWords(p.changes)}` : ''}
              {!restored && p.changedAt ? ` · ${formatDate(p.changedAt)}` : ''}
            </p>
            {restored && p.history[0].note && <p className="mt-1 text-ink-2">Why: “{p.history[0].note}”</p>}
            {fixed && !restored && p.hidden && <p className="mt-1 text-ink-2">It was hidden because: “{p.hidden.reason}”</p>}
            <p className="mt-1 text-ink-2">
              Compare it with what staff saw last time, under “What staff decided”. It {fixed ? 'stays hidden' : 'needs the checks again'} until someone looks.
            </p>
          </div>
        )}
        {!p.visible && !fixed && !removed && p.hidden && (
          <p className="mt-3 max-w-[62ch] border-l-2 border-line pl-3 text-[13.5px] text-ink-2">
            Hidden by {p.hidden.by} on {formatDate(p.hidden.at)}: “{p.hidden.reason}”
          </p>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section aria-label="The listing" className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-1">
          <div>
            <SectionTitle aside={<span className="font-mono text-[12px] text-ink-3">{p.photos.length}</span>}>Photos</SectionTitle>
            {p.photos.length === 0 ? (
              <p className="text-[14px] text-ink-2">The seller added no photos.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {p.photos.map((ph, i) => (
                  <figure key={ph.id} className={i === 0 ? 'col-span-2' : ''}>
                    {ph.url ? (
                      <a href={ph.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-leaf border border-line bg-raised">
                        <img src={ph.url} alt={`${p.name}, photo ${i + 1}`} className={`${i === 0 ? 'aspect-[1.6]' : 'aspect-square'} w-full object-cover`} />
                      </a>
                    ) : (
                      <div className={`grid ${i === 0 ? 'aspect-[1.6]' : 'aspect-square'} place-items-center rounded-leaf border border-dashed border-line bg-raised px-4 text-center`}>
                        <span>
                          <span className="block text-[14px] font-semibold text-ink-2">Photo {i + 1}</span>
                          <span className="mt-1 block text-[12px] text-ink-3">Shows here once the backend sends it</span>
                        </span>
                      </div>
                    )}
                  </figure>
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionTitle>What the seller wrote</SectionTitle>
            <Card className="p-5">
              {p.description ? <p className="max-w-[65ch] whitespace-pre-line text-[15px] leading-relaxed">{p.description}</p> : <p className="text-[14px] text-ink-3">No description.</p>}
            </Card>
          </div>

          {p.reports > 0 && (
            <div>
              <SectionTitle>What buyers reported</SectionTitle>
              <ul className="space-y-2 border-l-2 border-need/50 pl-4">
                {p.reportNotes?.map((n) => (
                  <li key={n.at} className="text-[14px]">
                    “{n.text}” <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(n.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <SectionTitle>The seller</SectionTitle>
            <Card className="p-5">
              <dl className="grid grid-cols-[minmax(9rem,auto)_1fr] gap-x-6 gap-y-2.5 text-sm">
                {(
                  [
                    ['Name', <Link to={`/people/${p.seller.id}`} className="underline-offset-4 hover:underline">{p.seller.name}</Link>],
                    ['Selling since', formatDate(p.seller.joinedAt)],
                    ['Other listings on sale', p.seller.listed],
                    ['Orders completed', p.seller.ordersCompleted],
                    ['Disputes', p.seller.disputes],
                    ['Listings removed before', <span className={p.seller.removedBefore ? 'font-semibold text-need' : ''}>{p.seller.removedBefore}</span>],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="min-w-0 break-words font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          <History history={p.history} now={p} />
        </section>

        {/* Phone: look at the listing first, then judge it. Wide: the checks stay beside it. */}
        <aside aria-label="Checks and decision" className="min-w-0 max-lg:row-start-2 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:self-start">
          {removed ? (
            <RemovedNotice p={p} />
          ) : (
            <>
              {p.flags.length > 0 && (
                <div className="mb-5 rounded-leaf-sm border border-need/40 bg-need/[0.07] p-4">
                  <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-need">
                    <StatusShape shape="petal" tone="need" size={9} />
                    {p.flags.length === 1 ? '1 thing to look at closely' : `${p.flags.length} things to look at closely`}
                  </p>
                  <ul className="space-y-1.5 text-[13.5px]">
                    {p.flags.map((f) => (
                      <li key={f.id}>{f.text}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[12px] text-ink-3">Found automatically from the words and price. Check them yourself before you decide.</p>
                </div>
              )}
              {stopped && (
                <div className="mb-5 rounded-leaf-sm border border-line bg-raised p-4 text-[13.5px]">
                  <p className="font-semibold">{sellerFirst} is stopped from listing</p>
                  <p className="mt-1 text-ink-2">
                    {stopped.reason} · {stopped.by} · {formatDate(stopped.at)}
                  </p>
                  <p className="mt-1 text-ink-3">Nothing of theirs goes back on sale until an owner lets them list again.</p>
                  {isOwner && (
                    <Button size="sm" className="mt-3" onClick={() => setSheet('allow')}>
                      Let {sellerFirst} list again
                    </Button>
                  )}
                </div>
              )}
              <SectionTitle aside={open ? <span className="font-mono text-[12px] text-ink-3">{done} of {all}</span> : undefined}>
                {open ? 'Check the listing' : 'Looked over'}
              </SectionTitle>
              {p.reviewedAt && !open && (
                <p className="mb-3 text-[13px] text-ink-2">
                  By {p.reviewedBy} on {formatDate(p.reviewedAt)}. Look again any time something seems off.
                </p>
              )}
              <Card className="p-2">
                <ul>
                  {CHECKS.map((k) => {
                    const on = ticked.has(k.id);
                    return (
                      <li key={k.id}>
                        <label className={`flex gap-3 rounded-leaf-sm px-3 py-3 ${mayDecide ? 'cursor-pointer hover:bg-raised' : ''}`}>
                          <input type="checkbox" aria-label={k.label} className="peer sr-only" checked={on} disabled={!mayDecide} onChange={() => toggle(k.id)} />
                          <span
                            aria-hidden
                            className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink-2 ${on ? 'border-settled bg-settled text-ground' : 'border-ink-3'}`}
                          >
                            {on && <FiCheck className="h-3.5 w-3.5" strokeWidth={3} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[14px] font-medium">
                              {k.label}
                              {flaggedChecks.has(k.id) && <span className="ml-2 text-[12px] font-semibold text-need">flagged</span>}
                            </span>
                            <span className="mt-0.5 block text-[12.5px] text-ink-3">{k.hint(p)}</span>
                            {p.guide.checks[k.id] && (
                              <span className="mt-1 block text-[12.5px] text-ink-2">
                                <span className="font-semibold">{p.category}:</span> {p.guide.checks[k.id]}
                              </span>
                            )}
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
                ) : (
                  <>
                    {open && !stopped && (
                      <div>
                        <Button variant="primary" size="lg" className="w-full" disabled={done < all} busy={marking.isLoading} onClick={fine}>
                          {done < all ? `${clearLabel} · ${all - done} ${all - done === 1 ? 'check' : 'checks'} left` : clearLabel}
                        </Button>
                        <p className="mt-1.5 text-[12.5px] text-ink-3">Then the next listing {reported ? 'buyers reported' : 'to look over'} opens.</p>
                        <ErrorNote>{fineError}</ErrorNote>
                      </div>
                    )}
                    {p.visible && (
                      <div>
                        <Button size="lg" className="w-full" onClick={() => setSheet('hide')}>
                          Hide until {sellerFirst} fixes it
                        </Button>
                        <p className="mt-1.5 text-[12.5px] text-ink-3">For things {sellerFirst} can put right, like wrong photos or details. It comes back here once fixed.</p>
                      </div>
                    )}
                    <div>
                      <Button variant="danger" size="lg" className="w-full" onClick={() => setSheet('remove')}>
                        Remove from Dezenmart
                      </Button>
                      <p className="mt-1.5 text-[12.5px] text-ink-3">For scams and things that can’t be sold here. It’s for good, and buyers who already paid are refunded.</p>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={sheet === 'hide'}
        title={`Hide ${p.name}`}
        summary={`Buyers can no longer see or buy it. ${sellerFirst} is told the reason and can fix the listing; it comes back to “To review” before it goes on sale again.${reported ? ` The ${p.reports === 1 ? 'buyer who reported it is' : `${p.reports} buyers who reported it are`} told it’s off sale.` : ''}`}
        actionLabel="Hide this listing"
        askReason
        reasonHint={`${sellerFirst} sees this, so say what to fix.`}
        danger
        onClose={() => setSheet(null)}
        onConfirm={async (reason) => {
          const failure = failureOf(await setVisible({ id: p.id, visible: false, reason }));
          if (!failure && p.needsLook) await goNext();
          return failure;
        }}
      />
      <ConfirmDialog
        open={sheet === 'allow'}
        title={`Let ${p.seller.name} list again`}
        summary={`${sellerFirst} can list again. Their hidden listings stay hidden until someone looks at each one.`}
        actionLabel={`Let ${sellerFirst} list again`}
        askReason
        reasonHint="Why. Only staff see this."
        onClose={() => setSheet(null)}
        onConfirm={async (reason) => failureOf(await allowSeller({ sellerId: p.seller.id, reason: reason ?? '' }))}
      />
      <ConfirmDialog
        open={sheet === 'keep'}
        title={`Keep ${p.name} on sale`}
        summary={`${p.reports === 1 ? 'Its report is' : `Its ${p.reports} reports are`} cleared and it leaves the Reported list. The ${p.reports === 1 ? 'buyer who reported it is' : 'buyers who reported it are'} told: “We checked it and it meets our rules, so it stays on sale.”`}
        actionLabel="Keep it on sale"
        askReason
        reasonHint="Why the reports did not hold up. Only staff see this."
        onClose={() => setSheet(null)}
        onConfirm={(note) => clear(note)}
      />
      <RemoveSheet open={sheet === 'remove'} p={p} suggested={suggestReason(p, ticked)} onClose={() => setSheet(null)} onDone={goNext} />
    </>
  );
}

function RemovedNotice({ p }: { p: ProductDetail }) {
  const r = p.removed!;
  const can = useCan();
  const [undoing, setUndoing] = useState(false);
  const [restore] = useRestoreProductMutation();
  const first = p.seller.name.split(' ')[0];
  return (
    <>
      <SectionTitle>Removed</SectionTitle>
      <Card className="space-y-3 p-5">
        <p className="text-[13px] text-ink-2">
          By {r.by} on {formatDate(r.at)}. It is off Dezenmart for good.
        </p>
        {r.stoppedSeller && (
          <p className="text-[13px] text-ink-2">
            {first} was also stopped from listing
            {r.stoppedSeller.hiddenListings ? `, and ${r.stoppedSeller.hiddenListings} other ${r.stoppedSeller.hiddenListings === 1 ? 'listing was' : 'listings were'} hidden` : ''}.
          </p>
        )}
        <div>
          <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">The notice {p.seller.name.split(' ')[0]} got</p>
          <SellerNotice product={p.name} reason={r.reason} message={r.message} />
          {r.heldOrders > 0 && (
            <p className="mt-2 text-[13px] text-ink-2">
              {r.heldOrders === 1 ? '1 paid order was' : `${r.heldOrders} paid orders were`} put on hold and opened as{' '}
              <Link to="/shopping/disputes" className="underline underline-offset-4">
                {r.heldOrders === 1 ? 'a dispute' : 'disputes'}
              </Link>{' '}
              so {r.heldOrders === 1 ? 'the buyer' : 'the buyers'} can be refunded.
            </p>
          )}
        </div>
        {can('staff_admin', 'shopping') && (
          <div className="border-t border-line pt-3">
            <Button size="sm" onClick={() => setUndoing(true)}>
              Undo this removal
            </Button>
            <p className="mt-1.5 text-[12.5px] text-ink-3">Owners only, for a removal that was wrong. It comes back hidden and is checked again before it goes on sale.</p>
          </div>
        )}
      </Card>
      <ConfirmDialog
        open={undoing}
        title={`Undo the removal of ${p.name}`}
        summary={`It comes back hidden and goes to “To review”, so someone checks it before it is on sale again. ${first} is told. Orders already on hold stay with the disputes.`}
        actionLabel="Undo the removal"
        askReason
        reasonHint="Why the removal was wrong. Only staff see this."
        onClose={() => setUndoing(false)}
        onConfirm={async (reason) => failureOf(await restore({ id: p.id, reason: reason ?? '' }))}
      />
    </>
  );
}

/** The notice exactly as the seller reads it, so staff see their words in place before sending. */
function SellerNotice({ product, reason, message }: { product: string; reason: RemovalReason; message: string }) {
  return (
    <div className="rounded-leaf-sm border border-line bg-ground p-4 text-[14px] leading-relaxed">
      <p className="font-semibold">We’ve removed “{product}” from Dezenmart</p>
      <p className="mt-1 text-ink-2">Reason: {REMOVAL[reason].label}</p>
      {message && <p className="mt-2 whitespace-pre-line">{message}</p>}
      <p className="mt-2 text-[13px] text-ink-3">
        {HOLDS_ORDERS.includes(reason) ? 'Payments for orders already placed are on hold while we refund the buyers.' : 'Orders already paid for go ahead as normal.'} If you think we got it
        wrong, reply to this message within 14 days and someone from the Dezenmart team will look again.
      </p>
    </div>
  );
}

function RemoveSheet({
  open,
  p,
  suggested,
  onClose,
  onDone,
}: {
  open: boolean;
  p: ProductDetail;
  suggested: { reason: RemovalReason; why: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<RemovalReason | null>(null);
  const [message, setMessage] = useState('');
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState('');
  const [stopSeller, setStopSeller] = useState(false);
  const [remove, removing] = useRemoveProductMutation();
  const first = p.seller.name.split(' ')[0];
  const reported = p.reports > 0;
  useEffect(() => {
    if (open) {
      // Start from what the flags or the unticked checks point at; staff can pick another.
      setReason(suggested?.reason ?? null);
      setMessage(suggested ? REMOVAL[suggested.reason].draft : '');
      setEdited(false);
      setError('');
      // A seller with listings removed before is stopped by default; staff can untick it.
      setStopSeller(p.seller.removedBefore > 0);
    }
    // Only when the sheet opens: the suggestion must not overwrite a choice made inside it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const choose = (r: RemovalReason) => {
    setReason(r);
    // A fresh draft for each reason, until staff start writing their own words.
    if (!edited) setMessage(REMOVAL[r].draft);
  };
  const ready = !!reason && message.trim().length >= 20;
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!ready || removing.isLoading) return;
    setError('');
    const failure = failureOf(await remove({ id: p.id, reason: reason!, message: message.trim(), stopSeller: stopSeller && !p.seller.stopped }));
    if (failure) setError(failure);
    else {
      onClose();
      onDone();
    }
  };
  return (
    <Dialog
      open={open}
      title={`Remove ${p.name}`}
      eyebrow="This cannot be undone"
      onClose={onClose}
      locked={removing.isLoading}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={onClose} disabled={removing.isLoading}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!ready} busy={removing.isLoading} onClick={() => submit()}>
            Remove and tell {first}
          </Button>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <p className="text-[15px] text-ink-2">
          The listing comes off Dezenmart for good and {first} gets the notice below.
          {p.openOrders > 0 &&
            (reason && HOLDS_ORDERS.includes(reason)
              ? p.openOrders === 1
                ? ` 1 paid order is put on hold and opened as a dispute, so the buyer is refunded instead of ${first} being paid.`
                : ` ${p.openOrders} paid orders are put on hold and opened as disputes, so the buyers are refunded instead of ${first} being paid.`
              : ` ${p.openOrders} paid ${p.openOrders === 1 ? 'order goes' : 'orders go'} ahead as normal.`)}
          {reported && ` The ${p.reports === 1 ? 'buyer who reported it is' : `${p.reports} buyers who reported it are`} told it was removed.`}
        </p>
        {suggested && reason === suggested.reason && <p className="-mt-2 text-[12.5px] text-ink-3">{suggested.why} Change it if it’s not right.</p>}
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold">Why</legend>
          <div className="space-y-1.5">
            {(Object.keys(REMOVAL) as RemovalReason[]).map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer items-center gap-3 rounded-leaf-sm border px-3.5 py-3 text-[14px] transition-colors ${reason === r ? 'border-ink-2 bg-raised font-semibold' : 'border-line hover:bg-raised/60'}`}
              >
                <input type="radio" name="removal-reason" className="accent-[var(--ink)]" checked={reason === r} onChange={() => choose(r)} />
                {REMOVAL[r].label}
              </label>
            ))}
          </div>
        </fieldset>
        {reason && (
          <>
            <Field label={`Message to ${first}`} hint={message.trim().length < 20 ? 'At least 20 characters. Say what was wrong, plainly.' : 'Saved with your name in the activity log.'}>
              <textarea
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  setEdited(true);
                }}
                rows={4}
                maxLength={800}
                className="w-full rounded-leaf-sm border border-line bg-ground px-3.5 py-2.5 text-[14.5px] text-ink placeholder:text-ink-3 focus:border-ink-2 focus:outline-none"
              />
            </Field>
            <div>
              <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">What {first} will read</p>
              <SellerNotice product={p.name} reason={reason} message={message.trim()} />
            </div>
          </>
        )}
        {!p.seller.stopped && (
          <label className="flex cursor-pointer gap-3 rounded-leaf-sm border border-line p-3.5">
            <input type="checkbox" className="mt-1 accent-[var(--ink)]" checked={stopSeller} onChange={(e) => setStopSeller(e.target.checked)} />
            <span className="text-[14px]">
              <span className="block font-semibold">Also stop {first} listing</span>
              <span className="mt-0.5 block text-[13px] text-ink-2">
                {p.seller.listed ? `Hides their ${p.seller.listed} other ${p.seller.listed === 1 ? 'listing' : 'listings'} and stops new ones` : 'Stops new listings'} until an owner lets them list again.
                {p.seller.removedBefore > 0 && ` ${first} has had ${p.seller.removedBefore} ${p.seller.removedBefore === 1 ? 'listing' : 'listings'} removed before.`}
              </span>
            </span>
          </label>
        )}
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

const FIELD_WORDS: [keyof ListingSnapshot, string][] = [
  ['name', 'Name'],
  ['category', 'Category'],
  ['price', 'Price'],
  ['stock', 'In stock'],
  ['photos', 'Photos'],
  ['description', 'Description'],
];
const DECISION_WORDS: Record<ProductDecision['kind'], string> = {
  looked_over: 'Looked over, nothing wrong',
  kept: 'Kept on sale after reports',
  hidden: 'Hidden',
  shown: 'Put back on sale',
  removed: 'Removed',
  restored: 'Removal undone by an owner',
};

/**
 * Every decision with the listing as it was then. A field the seller has changed since is marked, so
 * staff compare what was judged with what is live, and a dispute or reply can be settled from the record.
 */
function History({ history, now }: { history: ProductDecision[]; now: ProductDetail }) {
  if (!history.length) return null;
  const current: ListingSnapshot = {
    name: now.name,
    category: now.category,
    price: now.price,
    currency: now.currency,
    priceNgn: now.priceNgn,
    stock: now.stock,
    description: now.description,
    photos: now.photos.length,
  };
  const show = (k: keyof ListingSnapshot, v: ListingSnapshot) => (k === 'price' ? <Money amount={v.price} currency={v.currency} ngn={v.priceNgn} /> : String(v[k]));
  return (
    <div>
      <SectionTitle>What staff decided</SectionTitle>
      <ol className="space-y-3">
        {history.map((d, i) => {
          // Stock moves with every sale, so it is not counted as the seller changing the listing.
          const differs = FIELD_WORDS.filter(([k]) => k !== 'stock' && d.snapshot[k] !== current[k]).map(([k]) => k);
          return (
            <li key={d.at + d.kind}>
              <Card className="p-4">
                <p className="text-[14px] font-semibold">
                  {DECISION_WORDS[d.kind]}
                  <span className="font-normal text-ink-3">
                    {' '}
                    · {d.by} · {formatDate(d.at)}
                  </span>
                </p>
                {d.note && <p className="mt-1 max-w-[62ch] text-[13.5px] text-ink-2">“{d.note}”</p>}
                {d.told && (
                  <p className="mt-1 max-w-[62ch] text-[12.5px] text-ink-3">
                    Told the {d.told.count === 1 ? 'buyer' : `${d.told.count} buyers`} who reported it: “{d.told.message}”
                  </p>
                )}
                <details className="mt-2" open={i === 0 && differs.length > 0}>
                  <summary className="cursor-pointer text-[13px] text-ink-2 hover:text-ink">
                    What it looked like then{differs.length ? ` · ${differs.length} ${differs.length === 1 ? 'thing has' : 'things have'} changed since` : ' · same as now'}
                  </summary>
                  <dl className="mt-2 grid grid-cols-[minmax(6.5rem,auto)_1fr] gap-x-5 gap-y-1.5 text-[13px]">
                    {FIELD_WORDS.map(([k, label]) => {
                      const diff = differs.includes(k);
                      return (
                        <div key={k} className="contents">
                          <dt className="text-ink-3">{label}</dt>
                          <dd className={`min-w-0 break-words ${diff ? 'text-waiting' : ''}`}>
                            {show(k, d.snapshot)}
                            {diff && <span className="text-ink-3"> · now {k === 'description' ? 'different' : show(k, current)}</span>}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </details>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
