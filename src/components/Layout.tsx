import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import type { IconType } from 'react-icons';
import { FiActivity, FiHome, FiLogOut, FiMenu, FiShield, FiTruck, FiUsers, FiX } from 'react-icons/fi';
import { MdOutlineFastfood } from 'react-icons/md';
import { useAppDispatch, useAppSelector, useCan } from '../store';
import { accessLoaded, signedOut } from '../store/session';
import { api, useMeQuery, useSignOutMutation } from '../store/api';

interface NavItem {
  to: string;
  label: string;
  icon: IconType;
  /** Shown when the person has this capability on this service. */
  needs?: [string, string];
  /** Shown when the person has any capability on this service. */
  service?: string;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: FiHome },
  { to: '/food', label: 'DezenFoods', icon: MdOutlineFastfood, service: 'food' },
  { to: '/express', label: 'DezenExpress', icon: FiTruck, service: 'express' },
  { to: '/users', label: 'Users', icon: FiUsers, needs: ['read_pii', 'platform'] },
  { to: '/staff', label: 'Staff', icon: FiShield, needs: ['staff_admin', 'platform'] },
  { to: '/activity', label: 'Activity log', icon: FiActivity, needs: ['staff_admin', 'platform'] },
];

/** The signed-in frame: menu on the left (a drawer on phones), page on the right. */
export function Layout() {
  const { staffToken, access } = useAppSelector((s) => s.session);
  const dispatch = useAppDispatch();
  const can = useCan();
  const [open, setOpen] = useState(false);
  const [signOut] = useSignOutMutation();
  // Refresh access on load, so a change by an owner shows without signing in again.
  const me = useMeQuery(undefined, { skip: !staffToken });
  useEffect(() => {
    if (me.data) dispatch(accessLoaded(me.data));
  }, [me.data, dispatch]);

  if (!staffToken) return <Navigate to="/sign-in" replace />;

  const covers = (service: string) => !!access && (access.services.includes('*') || access.services.includes(service));
  const items = NAV.filter((n) => (n.needs ? can(...n.needs) : n.service ? covers(n.service) : true));

  const leave = async () => {
    await signOut();
    dispatch(signedOut());
    dispatch(api.util.resetApiState());
  };

  const menu = (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 p-4">
      <p className="mb-6 px-3 text-sm font-semibold tracking-wide text-accent">DEZEN ADMIN</p>
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-raised text-ink' : 'text-muted hover:text-ink'}`
          }
        >
          <Icon aria-hidden className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
      <div className="mt-auto border-t border-line pt-4">
        <p className="truncate px-3 text-xs text-muted" title={access?.email}>
          {access?.email}
        </p>
        <button
          type="button"
          onClick={leave}
          className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:text-ink cursor-pointer"
        >
          <FiLogOut aria-hidden className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-card md:block md:sticky md:top-0 md:h-screen">{menu}</aside>
      <div className="flex items-center justify-between border-b border-line bg-card px-4 py-3 md:hidden">
        <span className="text-sm font-semibold tracking-wide text-accent">DEZEN ADMIN</span>
        <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="text-muted hover:text-ink cursor-pointer">
          <FiMenu className="h-5 w-5" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-64 bg-card">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 text-muted hover:text-ink cursor-pointer"
            >
              <FiX className="h-5 w-5" />
            </button>
            {menu}
          </aside>
        </div>
      )}
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
  );
}
