import { useEffect, useState, type ReactNode } from 'react';
import { FiSearch } from 'react-icons/fi';
import { Segments } from './ui';

/** Above every list: the views as chips, and a search applied after a short pause. */
export function ListToolbar({
  q,
  status,
  statuses,
  placeholder,
  onChange,
  children,
}: {
  q: string;
  status?: string;
  statuses?: { value: string; label: string }[];
  placeholder: string;
  onChange: (changes: { q?: string; status?: string }) => void;
  /** More filters (category, sort), shown beside the search. */
  children?: ReactNode;
}) {
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text === q) return;
    const t = setTimeout(() => onChange({ q: text.trim() }), 350);
    return () => clearTimeout(t);
  }, [text, q, onChange]);
  return (
    // With extra filters the views get a row of their own and the filters the row below, so neither is
    // squeezed. With search alone, both fit on one row on wide screens.
    <div className={`mb-5 flex flex-col gap-3 ${children ? '' : 'lg:flex-row lg:items-center lg:justify-between'}`}>
      {statuses && <Segments label="Show" value={status ?? ''} options={statuses} onChange={(v) => onChange({ status: v })} />}
      <div className={`flex w-full flex-col gap-2 sm:flex-row sm:items-center ${children ? '' : 'lg:w-auto lg:shrink-0'}`}>
      {children}
      <label className={`relative w-full ${children ? 'sm:min-w-0 sm:flex-1 lg:max-w-sm' : 'lg:w-72'}`}>
        <span className="sr-only">{placeholder}</span>
        <FiSearch aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-leaf-sm border border-line bg-surface pl-10 pr-3 text-[14px] text-ink placeholder:text-ink-3 focus:border-ink-2 focus:outline-none"
        />
      </label>
      </div>
    </div>
  );
}
