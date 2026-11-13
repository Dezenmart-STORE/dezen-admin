import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from './Dialog';

/** Where "g" then a letter goes. */
const GO: Record<string, { to: string; label: string }> = {
  h: { to: '/', label: 'Home' },
  a: { to: '/approvals', label: 'Approvals' },
  f: { to: '/food/orders', label: 'Food orders' },
  d: { to: '/food/disputes', label: 'Food disputes' },
  t: { to: '/express/bookings', label: 'Trips' },
  w: { to: '/express/withdrawals', label: 'Rider withdrawals' },
  s: { to: '/shopping/disputes', label: 'Shopping disputes' },
  p: { to: '/people', label: 'People' },
  m: { to: '/money/payments', label: 'Payments' },
  l: { to: '/activity', label: 'Activity log' },
};

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable);
};

/** Rows that j/k move between: every list row link, queue row and search result. */
const rows = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-nav-row]')).filter((el) => el.offsetParent !== null);

/**
 * Keyboard use for people who work the queues all day:
 *  /        search         ?   these shortcuts
 *  j / k    next / previous row, Enter opens it
 *  g then … jump to a page  b   back to the list
 * Ignored while typing, and while a sheet is open (money is never moved by a shortcut).
 */
export function Shortcuts() {
  const navigate = useNavigate();
  const [help, setHelp] = useState(false);
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector('dialog[open]')) return;
      const k = e.key;

      if (pendingG.current) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const dest = GO[k.toLowerCase()];
        if (dest) {
          e.preventDefault();
          navigate(dest.to);
        }
        return;
      }

      if (k === '?') {
        e.preventDefault();
        setHelp(true);
      } else if (k === '/') {
        e.preventDefault();
        const box = document.getElementById('top-search');
        if (box && box.offsetParent !== null) box.focus();
        else navigate('/search');
      } else if (k === 'g') {
        pendingG.current = window.setTimeout(() => (pendingG.current = null), 1200);
      } else if (k === 'j' || k === 'k') {
        const list = rows();
        if (!list.length) return;
        e.preventDefault();
        const at = list.indexOf(document.activeElement as HTMLElement);
        const next = at === -1 ? (k === 'j' ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, at + (k === 'j' ? 1 : -1)));
        list[next].focus();
        list[next].scrollIntoView({ block: 'nearest' });
      } else if (k === 'b') {
        const back = document.querySelector<HTMLAnchorElement>('[data-nav-back]');
        if (back) {
          e.preventDefault();
          back.click();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const Key = ({ children }: { children: string }) => (
    <kbd className="inline-grid min-w-6 place-items-center rounded-md border border-line bg-raised px-1.5 font-mono text-[12px] text-ink">{children}</kbd>
  );
  const row = (keys: string[], label: string) => (
    <li key={label} className="flex items-center justify-between gap-4 py-2">
      <span className="text-[14px] text-ink-2">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((x, i) => (
          <Key key={i}>{x}</Key>
        ))}
      </span>
    </li>
  );

  return (
    <Dialog open={help} title="Keyboard shortcuts" onClose={() => setHelp(false)}>
      <ul className="divide-y divide-line">
        {row(['/'], 'Search everything')}
        {row(['j', 'k'], 'Next / previous row')}
        {row(['Enter'], 'Open the row')}
        {row(['b'], 'Back to the list')}
        {row(['?'], 'Show these shortcuts')}
      </ul>
      <p className="mb-1 mt-5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">Go to · press g, then</p>
      <ul className="divide-y divide-line">{Object.entries(GO).map(([k, v]) => row(['g', k], v.label))}</ul>
      <p className="mt-5 text-[13px] text-ink-3">No shortcut ever moves money. Those always go through the sheet with your code.</p>
    </Dialog>
  );
}
