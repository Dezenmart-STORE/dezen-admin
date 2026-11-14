import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FiBell, FiBellOff, FiHome, FiLogOut, FiMenu, FiSearch, FiWifiOff, FiX } from 'react-icons/fi';
import { useAlertSetting, useOnline, useUrgentAlerts } from '../lib/device';
import { SAMPLE_LABEL } from '../lib/config';
import { useAppDispatch, useAppSelector, useCan } from '../store';
import { accessLoaded, signedOut } from '../store/session';
import { api, useMeQuery, useQueuesQuery, useSignOutMutation } from '../store/api';
import type { Capability, Service } from '../store/types';
import { ServiceGlyph, Wordmark } from './brand';
import { Shortcuts } from './Shortcuts';

interface NavItem {
  to: string;
  label: string;
  needs: [Capability, Service];
}
interface NavGroup {
  group: string;
  service?: Service;
  items: NavItem[];
}

/** The menu: one group per shape of the mark. A link shows only when the person's access covers it. */
export const NAV: NavGroup[] = [
  {
    group: 'DezenFoods',
    service: 'food',
    items: [
      { to: '/food/orders', label: 'Orders', needs: ['support', 'food'] },
      { to: '/food/disputes', label: 'Disputes', needs: ['support', 'food'] },
      { to: '/food/vendors', label: 'Vendors', needs: ['support', 'food'] },
    ],
  },
  {
    group: 'DezenExpress',
    service: 'express',
    items: [
      { to: '/express/bookings', label: 'Trips', needs: ['support', 'express'] },
      { to: '/express/withdrawals', label: 'Rider withdrawals', needs: ['support', 'express'] },
      { to: '/express/riders', label: 'Riders', needs: ['support', 'express'] },
      { to: '/express/providers', label: 'Delivery companies', needs: ['support', 'express'] },
    ],
  },
  {
    group: 'Shopping',
    service: 'shopping',
    items: [
      { to: '/shopping/orders', label: 'Orders', needs: ['support', 'shopping'] },
      { to: '/shopping/disputes', label: 'Disputes', needs: ['support', 'shopping'] },
      { to: '/shopping/products', label: 'Products', needs: ['support', 'shopping'] },
      { to: '/shopping/sellers', label: 'Sellers', needs: ['support', 'shopping'] },
    ],
  },
  {
    group: 'People and money',
    service: 'platform',
    items: [
      { to: '/people', label: 'People', needs: ['support', 'platform'] },
      { to: '/money/payments', label: 'Payments', needs: ['support', 'platform'] },
      { to: '/money/notices', label: 'Payment notices', needs: ['support', 'platform'] },
      { to: '/money/balance-check', label: 'Daily balance check', needs: ['move_money', 'platform'] },
    ],
  },
  {
    group: 'Team',
    items: [
      { to: '/settings', label: 'Fees and fares', needs: ['support', 'platform'] },
      { to: '/staff', label: 'Staff', needs: ['staff_admin', 'platform'] },
      { to: '/activity', label: 'Activity log', needs: ['staff_admin', 'platform'] },
    ],
  },
];

function TopSearch({ autoFocus }: { autoFocus?: boolean }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const [q, setQ] = useState(pathname === '/search' ? (params.get('q') ?? '') : '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <form role="search" onSubmit={submit} className="relative w-full">
      <label htmlFor="top-search" className="sr-only">
        Search everything
      </label>
      <FiSearch aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
      <input
        id="top-search"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name, phone, order or payment reference"
        className="h-10 w-full rounded-leaf-sm border border-line bg-surface pl-10 pr-14 text-[14px] text-ink placeholder:text-ink-3 focus:border-ink-2 focus:outline-none"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 font-mono text-[10.5px] text-ink-3 md:block">/</kbd>
    </form>
  );
}

/** The signed-in frame: the mark's four services in the menu, search on top, the work in the middle. */
export function Layout() {
  const { staffToken, access } = useAppSelector((s) => s.session);
  const dispatch = useAppDispatch();
  const can = useCan();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOut] = useSignOutMutation();
  const me = useMeQuery(undefined, { skip: !staffToken });
  const queues = useQueuesQuery(undefined, { skip: !staffToken, pollingInterval: 60_000 });
  const online = useOnline();
  const alerts = useAlertSetting();
  useUrgentAlerts(queues.data, alerts.enabled);

  useEffect(() => {
    if (me.data) dispatch(accessLoaded(me.data));
  }, [me.data, dispatch]);
  useEffect(() => setMenuOpen(false), [pathname]);


  /** Items waiting per menu link, from the queues. */
  const waiting = useMemo(() => {
    const out: Record<string, number> = {};
    for (const q of queues.data ?? []) {
      const path = q.link.split('?')[0];
      out[path] = (out[path] ?? 0) + q.count;
    }
    return out;
  }, [queues.data]);
  const totalWaiting = Object.values(waiting).reduce((a, b) => a + b, 0);

  if (!staffToken) return <Navigate to="/sign-in" replace />;

  const leave = async () => {
    await signOut();
    dispatch(signedOut());
    dispatch(api.util.resetApiState());
  };

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(...i.needs)) })).filter((g) => g.items.length);

  const link = (to: string, label: ReactNode, count?: number, end?: boolean) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      className={({ isActive }) =>
        `group flex h-9 items-center gap-2.5 rounded-leaf-sm px-3 text-[14px] transition-colors ${isActive ? 'bg-raised font-semibold text-ink' : 'text-ink-2 hover:bg-raised/60 hover:text-ink'}`
      }
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {!!count && <span className="font-mono text-[12px] font-medium text-need">{count}</span>}
    </NavLink>
  );

  const menu = (
    <nav aria-label="Main" className="flex h-full flex-col overflow-y-auto px-3 pb-4 pt-5">
      <div className="mb-6 px-3">
        <Wordmark />
      </div>
      {link('/', 'Home', totalWaiting - (waiting['/approvals'] ?? 0), true)}
      {access?.capabilities.includes('move_money') && link('/approvals', 'Approvals', waiting['/approvals'])}
      {groups.map((g) => (
        <div key={g.group} className="mt-6">
          <p className="mb-1.5 flex items-center gap-2 px-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-3">
            {g.service && <ServiceGlyph service={g.service} size={14} />}
            {g.group}
          </p>
          {g.items.map((i) => link(i.to, i.label, waiting[i.to]))}
        </div>
      ))}
      <div className="mt-auto space-y-3 border-t border-line px-3 pt-4">
        {SAMPLE_LABEL && (
          <span className="block font-mono text-[10.5px] uppercase tracking-[0.08em] text-waiting">
            {SAMPLE_LABEL}
          </span>
        )}
        {alerts.supported && (
          <button
            type="button"
            onClick={() => (alerts.enabled ? alerts.turnOff() : alerts.turnOn())}
            disabled={alerts.blocked}
            title={alerts.blocked ? 'Alerts are blocked in this browser. Allow them in the site settings.' : undefined}
            className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {alerts.enabled ? <FiBell aria-hidden className="h-3.5 w-3.5" /> : <FiBellOff aria-hidden className="h-3.5 w-3.5" />}
            {alerts.enabled ? 'Alerts on for urgent work' : 'Turn on alerts'}
          </button>
        )}
        <p className="truncate text-[12.5px] text-ink-3" title={access?.email}>
          {access?.email}
        </p>
        <button type="button" onClick={leave} className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2 hover:text-ink">
          <FiLogOut aria-hidden className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </nav>
  );

  const tab = (to: string, label: string, icon: ReactNode, end?: boolean) => (
    <NavLink to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isActive ? 'text-ink' : 'text-ink-3'}`}>
      {icon}
      {label}
    </NavLink>
  );

  return (
    <div className="min-h-dvh md:flex">
      <a href="#main" className="sr-only z-50 rounded-leaf-sm bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to the work
      </a>
      <Shortcuts />
      {/* Desktop menu */}
      <aside className="hidden w-64 shrink-0 border-r border-line bg-sunk md:sticky md:top-0 md:block md:h-dvh">{menu}</aside>

      {/* Phone menu sheet */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[min(20rem,86vw)] bg-sunk pt-[env(safe-area-inset-top)] animate-[sheet-up_280ms_var(--ease-settle)]">
            <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute right-3 top-[max(1rem,env(safe-area-inset-top))] cursor-pointer p-1 text-ink-3 hover:text-ink">
              <FiX className="h-5 w-5" />
            </button>
            {menu}
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
        {/* Phone top bar */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-ground px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
          <Wordmark compact />
          {SAMPLE_LABEL && (
            <span title={SAMPLE_LABEL} className="font-mono text-[10px] uppercase tracking-[0.08em] text-waiting">
              Sample
            </span>
          )}
        </div>
        {/* Desktop search */}
        <div className="sticky top-0 z-30 hidden border-b border-line bg-ground px-8 py-3 md:block">
          <div className="max-w-xl">
            <TopSearch />
          </div>
        </div>
        {!online && (
          <p role="status" className="flex items-center justify-center gap-2 border-b border-waiting/40 bg-waiting/[0.1] px-4 py-2 text-center text-[13px]">
            <FiWifiOff aria-hidden className="h-3.5 w-3.5 shrink-0 text-waiting" />
            You're offline. What you see may be out of date, and nothing can be sent until you're back.
          </p>
        )}
        <main id="main" tabIndex={-1} className="mx-auto max-w-[1200px] px-4 pb-10 pt-6 outline-none md:px-8 md:pt-9">
          <Outlet />
        </main>
      </div>

      {/* Phone tabs */}
      <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-line bg-sunk pb-[env(safe-area-inset-bottom)] md:hidden">
        {tab('/', 'Home', <FiHome className="h-5 w-5" />, true)}
        {tab('/search', 'Search', <FiSearch className="h-5 w-5" />)}
        <button type="button" onClick={() => setMenuOpen(true)} className="flex cursor-pointer flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-ink-3">
          <FiMenu className="h-5 w-5" />
          Menu
        </button>
      </nav>
    </div>
  );
}

export { TopSearch };
