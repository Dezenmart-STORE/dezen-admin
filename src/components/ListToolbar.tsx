import { useEffect, useState } from 'react';
import { FiSearch } from 'react-icons/fi';
import { Input, Select } from './ui';

/** Search box (applied after a short pause) and an optional status filter above a list. */
export function ListToolbar({
  q,
  status,
  statuses,
  placeholder,
  onChange,
}: {
  q: string;
  status?: string;
  statuses?: { value: string; label: string }[];
  placeholder: string;
  onChange: (changes: { q?: string; status?: string }) => void;
}) {
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text === q) return;
    const t = setTimeout(() => onChange({ q: text.trim() }), 350);
    return () => clearTimeout(t);
  }, [text, q, onChange]);
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <label className="relative min-w-56 flex-1 sm:max-w-sm">
        <span className="sr-only">{placeholder}</span>
        <FiSearch aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="pl-9" />
      </label>
      {statuses && (
        <Select aria-label="Show" value={status ?? ''} onChange={(e) => onChange({ status: e.target.value })} className="w-auto">
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
