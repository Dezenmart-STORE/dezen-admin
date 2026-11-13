import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FiLogOut, FiMenu, FiSearch, FiX } from 'react-icons/fi';
import { USE_SAMPLE_DATA } from '../lib/config';
import { useAppDispatch, useAppSelector, useCan } from '../store';
import { accessLoaded, signedOut } from '../store/session';
import { api, useMeQuery, useSignOutMutation } from '../store/api';
import type { Capability, Service } from '../store/types';
import { Input } from './ui';

interface NavItem {
  to: string;
  label: string;
  needs: [Capability, Service];
}

/** The menu. A group or link shows only when the person's access covers it. */
export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'DezenFoods',
    items: [
      { to: '/food/orders', label: 'Orders', needs: ['support', 'food'] },
      { to: '/food/disputes', label: 'Disputes', needs: ['support', 'food'] },
      { to: '/food/vendors', label: 'Vendors', needs: ['support', 'food'] },
    ],
  },
  {
    group: 'DezenExpress',
    items: [
      { to: '/express/bookings', label: 'Trips', needs: ['support', 'express'] },
      { to: '/express/withdrawals', label: 'Rider withdrawals', needs: ['support', 'express'] },
      { to: '/express/riders', label: 'Riders', needs: ['support', 'express'] },
      { to: '/express/providers', label: 'Delivery companies', needs: ['support', 'express'] },
    ],
  },
  {
    group: 'Shopping',
    items: [
      { to: '/shopping/orders', label: 'Orders', needs: ['support', 'shopping'] },
      { to: '/shopping/disputes', label: 'Disputes', needs: ['support', 'shopping'] },
      { to: '/shopping/products', label: 'Products', needs: ['support', 'shopping'] },
      { to: '/shopping/sellers', label: 'Sellers', needs: ['support', 'shopping'] },
    ],
  },
  {
    group: 'Money',
    items: [
      { to: '/money/payments', label: 'Payments', needs: ['support', 'platform'] },
      { to: '/money/notices', label: 'Payment notices', needs: ['support', 'platform'] },
      { to: '/money/balance-check', label: 'Daily balance check', needs: ['move_money', 'platform'] },
    ],
  },
  {
    group: 'Dezenmart',
    items: [
      { to: '/people', label: 'People', needs: ['support', 'platform'] },
      { to: '/settings', label: 'Fees and fares', needs: ['support', 'platform'] },
      { to: '/staff', label: 'Staff', needs: ['staff_admin', 'platform'] },
      { to: '/activity', label: 'Activity log', needs: ['staff_admin', 'platform'] },
    ],
  },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-raised text-ink' : 'text-muted hover:text-ink'}`;

function TopSearch() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const [q, setQ] = useState(pathname === '/search' ? (params.get('q') ?? '') : '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <form role="search" onSubmit={submit} className="relative w-full max-w-md">
      <label htmlFor="top-search" className="sr-only">
        Search everything
      </label>
      <FiSearch aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <Input id="top-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, orders, trips, payments…" className="pl-9" />
    </form>
  );
}

/** The signed-in frame: menu on the left (a drawer on phones), search on top, page below. */
export function Layout() {
  const { staffToken, access } = useAppSelector((s) => s.session);
  const dispatch = useAppDispatch();
  const can = useCan();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const [signOut] = useSignOutMutation();
  // Refresh access on load, so a change by an owner shows without signing in again.
  const me = useMeQuery(undefined, { skip: !staffToken });
  useEffect(() => {
    if (me.data) dispatch(accessLoaded(me.data));
  }, [me.data, dispatch]);
  useEffect(() => setOpen(false), [pathname]);

  if (!staffToken) return <Navigate to="/sign-in" replace />;

  const leave = async () => {
    await signOut();
    dispatch(signedOut());
    dispatch(api.util.resetApiState());
  };

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(...i.needs)) })).filter((g) => g.items.length);

  const menu = (
    <nav aria-label="Main" className="flex h-full flex-col overflow-y-auto p-4">
      <p className="mb-5 px-3 text-sm font-semibold tracking-wide text-accent">DEZEN ADMIN</p>
      <NavLink to="/" end className={linkClass}>
        Home
      </NavLink>
      {groups.map((g) => (
        <div key={g.group} className="mt-5">
          <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted/70">{g.group}</p>
          {g.items.map((i) => (
            <NavLink key={i.to} to={i.to} className={linkClass}>
              {i.label}
            </NavLink>
          ))}
        </div>
      ))}
      <div className="mt-auto border-t border-line pt-4">
        <p className="truncate px-3 text-xs text-muted" title={access?.email}>
          {access?.email}
        </p>
        <button type="button" onClick={leave} className="mt-2 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:text-ink">
          <FiLogOut aria-hidden className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-card md:sticky md:top-0 md:block md:h-screen">{menu}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-64 bg-card">
            <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-3 top-4 cursor-pointer text-muted hover:text-ink">
              <FiX className="h-5 w-5" />
            </button>
            {menu}
          </aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        {USE_SAMPLE_DATA && (
          <p className="bg-warn/15 px-4 py-1.5 text-center text-xs text-warn">
            Sample data: nothing here is real, and nothing you do reaches customers.
          </p>
        )}
        <div className="flex items-center gap-3 border-b border-line bg-card px-4 py-3 md:px-8">
          <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="cursor-pointer text-muted hover:text-ink md:hidden">
            <FiMenu className="h-5 w-5" />
          </button>
          <TopSearch />
        </div>
        <main className="px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
