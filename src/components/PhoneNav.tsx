import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { FiBell, FiBellOff, FiChevronDown, FiChevronLeft, FiLogOut, FiSearch } from 'react-icons/fi';
import { useHomeQuery } from '../store/api';
import type { Service } from '../store/types';
import { Mark, SERVICE_NAME, ServiceGlyph, StatusShape, Wordmark } from './brand';

/**
 * The phone navigation, built around what staff do on a phone: take the next person, look someone up,
 * approve a payment, and reach a queue. The top bar always says where you are; the bar holds the jobs;
 * every queue is two taps away in the Work sheet, which rises from the bottom with its close in thumb reach.
 */

export interface PhoneGroup {
  group: string;
  service?: Service;
  items: { to: string; label: string }[];
}

/** Record pages: what they are called, and the list they belong to. */
const RECORDS: { re: RegExp; title: string; back: string }[] = [
  { re: /^\/food\/orders\/[^/]+$/, title: 'Food order', back: '/food/orders' },
  { re: /^\/food\/vendors\/[^/]+$/, title: 'Kitchen', back: '/food/vendors' },
  { re: /^\/express\/bookings\/[^/]+$/, title: 'Trip', back: '/express/bookings' },
  { re: /^\/express\/riders\/[^/]+$/, title: 'Rider', back: '/express/riders' },
  { re: /^\/express\/providers\/[^/]+$/, title: 'Delivery company', back: '/express/providers' },
  { re: /^\/shopping\/orders\/[^/]+$/, title: 'Shopping order', back: '/shopping/orders' },
  { re: /^\/people\/[^/]+$/, title: 'Person', back: '/people' },
];

/** Where the person is: the page name, its service, and where back goes. */
export function usePlace(groups: PhoneGroup[]) {
  const { pathname } = useLocation();
  if (pathname === '/') return { title: 'Home', home: true as const };
  if (pathname === '/search') return { title: 'Search' };
  if (pathname === '/approvals') return { title: 'Approvals' };
  const record = RECORDS.find((r) => r.re.test(pathname));
  const listPath = record?.back ?? pathname;
  const group = groups.find((g) => g.items.some((i) => i.to === listPath));
  const item = group?.items.find((i) => i.to === listPath);
  return {
    title: record?.title ?? item?.label ?? 'Dezen Admin',
    service: group?.service,
    // A list's name alone can be ambiguous ("Disputes"), so the service is always said above it.
    context: group?.service ? SERVICE_NAME[group.service] : group?.group,
    back: record ? record.back : undefined,
  };
}

export function PhoneTopBar({ groups }: { groups: PhoneGroup[] }) {
  const place = usePlace(groups);
  const navigate = useNavigate();
  const goBack = () => {
    // Back to where they came from when that was inside the admin (keeps their filters), else to the list.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else if ('back' in place && place.back) navigate(place.back);
  };
  return (
    <div className="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-line bg-ground px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden">
      {'home' in place ? (
        <span className="px-2">
          <Wordmark compact />
        </span>
      ) : (
        <>
          {'back' in place && place.back ? (
            <button type="button" onClick={goBack} aria-label="Back" className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-ink-2 hover:text-ink">
              <FiChevronLeft aria-hidden className="h-6 w-6" />
            </button>
          ) : (
            <span className="w-2" />
          )}
          <span className="flex min-w-0 items-center gap-2.5">
            {'service' in place && place.service && <ServiceGlyph service={place.service} size={18} title />}
            <span className="min-w-0">
              {'context' in place && place.context && <span className="block truncate font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">{place.context}</span>}
              <span className="block truncate text-[16px] font-semibold leading-tight">{place.title}</span>
            </span>
          </span>
        </>
      )}
    </div>
  );
}

const Badge = ({ n, tone, label }: { n: number; tone: 'need' | 'quiet'; label: string }) =>
  n > 0 ? (
    <span
      aria-label={label}
      className={`absolute -top-1 left-1/2 ml-2 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 font-mono text-[10px] font-semibold ${tone === 'need' ? 'bg-need text-ground' : 'bg-raised text-ink-2'}`}
    >
      {n > 99 ? '99+' : n}
    </span>
  ) : null;

/** The bar: Home, Search, Approvals (only for people who can move money), Work. */
export function PhoneTabs({ approvals, showApprovals, onWork, workOpen, inWork }: { approvals: number; showApprovals: boolean; onWork: () => void; workOpen: boolean; inWork: boolean }) {
  const { data: home } = useHomeQuery(undefined, { pollingInterval: 60_000 });
  const late = home?.latePeople ?? 0;
  const cls = (on: boolean) => `relative flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${on ? 'text-ink' : 'text-ink-3'}`;
  const icon = (node: ReactNode) => <span className="relative grid h-6 place-items-center">{node}</span>;
  return (
    <nav aria-label="Quick" className={`fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-sunk pb-[env(safe-area-inset-bottom)] md:hidden ${showApprovals ? 'grid-cols-4' : 'grid-cols-3'}`}>
      <NavLink to="/" end className={({ isActive }) => cls(isActive)} aria-label={late ? `Home. ${late} people past our promise` : 'Home'}>
        {({ isActive }) => (
          <>
            {icon(
              <>
                {/* Always the solid mark so it reads at a glance; in grey until you are on Home. */}
                <span aria-hidden className={`grid place-items-center transition-[filter,opacity] ${isActive ? '' : 'opacity-70 grayscale'}`}>
                  <Mark size={20} />
                </span>
                <Badge n={late} tone="need" label={`${late} past our promise`} />
              </>,
            )}
            Home
          </>
        )}
      </NavLink>
      <NavLink to="/search" className={({ isActive }) => cls(isActive)}>
        {icon(<FiSearch aria-hidden className="h-5 w-5" />)}
        Search
      </NavLink>
      {showApprovals && (
        <NavLink to="/approvals" className={({ isActive }) => cls(isActive)} aria-label={approvals ? `Approvals. ${approvals} waiting for you` : 'Approvals'}>
          {icon(
            <>
              <StatusShape shape="ring" tone={approvals ? 'waiting' : 'quiet'} size={18} />
              <Badge n={approvals} tone="need" label={`${approvals} waiting`} />
            </>,
          )}
          Approvals
        </NavLink>
      )}
      <button type="button" onClick={onWork} aria-haspopup="dialog" aria-expanded={workOpen} className={`${cls(inWork || workOpen)} cursor-pointer`}>
        {icon(
          <span aria-hidden className="grid grid-cols-2 gap-[3px]">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-[7px] w-[7px] rounded-[2px] ${inWork || workOpen ? 'bg-ink' : 'bg-ink-3'}`} />
            ))}
          </span>,
        )}
        Work
      </button>
    </nav>
  );
}

/**
 * Every queue, two taps away: the four services by name with what is waiting, each opening its pages.
 * Rises from the bottom (where it was opened from), with Close in thumb reach.
 */
export function WorkSheet({
  open,
  onClose,
  groups,
  waiting,
  email,
  alerts,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  groups: PhoneGroup[];
  waiting: Record<string, number>;
  email?: string;
  alerts: { supported: boolean; enabled: boolean; blocked: boolean; turnOn: () => void; turnOff: () => void };
  onSignOut: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { pathname } = useLocation();
  const { data: home } = useHomeQuery(undefined, { skip: !open });
  const lateIn = (s?: Service) => !!s && !!home?.services.find((x) => x.service === s)?.late;
  const current = groups.find((g) => g.items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`)))?.group;
  const [openGroup, setOpenGroup] = useState<string | undefined>(current);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setOpenGroup(current);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, current]);

  const services = groups.filter((g) => g.service);
  const others = groups.filter((g) => !g.service);

  return (
    <dialog
      ref={ref}
      aria-label="Work"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-0 mt-auto max-h-[88dvh] w-full max-w-none rounded-t-[22px] border-t border-line bg-surface p-0 text-ink backdrop:bg-black/60 md:hidden"
    >
      {open && (
        <div className="flex max-h-[88dvh] flex-col animate-[sheet-up_280ms_var(--ease-settle)]">
          <span aria-hidden className="mx-auto mb-1 mt-2.5 h-1 w-9 shrink-0 rounded-full bg-line" />
          <div className="overflow-y-auto px-4 pb-2">
            <ul>
              {services.map((g) => {
                const total = g.items.reduce((n, i) => n + (waiting[i.to] ?? 0), 0);
                const late = lateIn(g.service);
                const expanded = openGroup === g.group;
                const summary = g.items
                  .filter((i) => waiting[i.to])
                  .map((i) => `${i.label} ${waiting[i.to]}`)
                  .join(' · ');
                return (
                  <li key={g.group} className="border-b border-line">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpenGroup(expanded ? undefined : g.group)}
                      className="grid min-h-16 w-full cursor-pointer grid-cols-[22px_minmax(0,1fr)_auto_18px] items-center gap-3 py-3 text-left"
                    >
                      <ServiceGlyph service={g.service!} size={20} />
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold">{SERVICE_NAME[g.service!]}</span>
                        <span className="block truncate text-[12.5px] text-ink-3">{summary || 'Nothing waiting'}</span>
                      </span>
                      <span className={`font-mono text-[13px] font-semibold ${late ? 'text-need' : 'text-ink-2'}`}>
                        {total ? (late ? `${total} · late` : total) : ''}
                      </span>
                      <FiChevronDown aria-hidden className={`h-4 w-4 text-ink-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                    {expanded && (
                      <ul className="pb-2 pl-[34px]">
                        {/* What is waiting first, then the rest. */}
                        {[...g.items]
                          .sort((a, b) => Number(!!waiting[b.to]) - Number(!!waiting[a.to]))
                          .map((i) => (
                            <li key={i.to}>
                              <Link
                                to={i.to}
                                onClick={onClose}
                                aria-current={pathname === i.to ? 'page' : undefined}
                                className={`flex min-h-12 items-center justify-between gap-3 rounded-leaf-sm px-3 text-[14.5px] ${pathname === i.to ? 'bg-raised font-semibold' : 'text-ink-2'}`}
                              >
                                <span>{i.label}</span>
                                {!!waiting[i.to] && <span className="font-mono text-[12.5px] font-semibold text-need">{waiting[i.to]}</span>}
                              </Link>
                            </li>
                          ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            {others.map((g) => (
              <div key={g.group} className="mt-4">
                <p className="mb-1 px-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">{g.group}</p>
                <div className="flex flex-wrap gap-2">
                  {g.items.map((i) => (
                    <Link key={i.to} to={i.to} onClick={onClose} className="inline-flex min-h-11 items-center rounded-leaf-sm border border-line px-3.5 text-[14px] text-ink-2">
                      {i.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-[13px] text-ink-2">
              {alerts.supported && (
                <button
                  type="button"
                  onClick={() => (alerts.enabled ? alerts.turnOff() : alerts.turnOn())}
                  disabled={alerts.blocked}
                  className="flex min-h-11 cursor-pointer items-center gap-2 disabled:opacity-50"
                >
                  {alerts.enabled ? <FiBell aria-hidden className="h-4 w-4" /> : <FiBellOff aria-hidden className="h-4 w-4" />}
                  {alerts.enabled ? 'Alerts on' : 'Turn on alerts'}
                </button>
              )}
              <button type="button" onClick={onSignOut} className="flex min-h-11 cursor-pointer items-center gap-2">
                <FiLogOut aria-hidden className="h-4 w-4" />
                Sign out
              </button>
              {email && <span className="w-full truncate text-[12px] text-ink-3">{email}</span>}
            </div>
          </div>
          <div className="shrink-0 border-t border-line px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <button type="button" onClick={onClose} className="h-12 w-full cursor-pointer rounded-leaf-sm border border-line text-[15px] font-semibold">
              Close
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
