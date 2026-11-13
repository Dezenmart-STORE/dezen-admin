import { useSearchParams } from 'react-router-dom';

/** Filters and page live in the address, so a list can be linked to and survives a reload. */
export function useListParams(defaults: { status?: string } = {}) {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? defaults.status ?? '';
  const q = params.get('q') ?? '';
  const page = Number(params.get('page')) || 1;
  const set = (changes: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined || v === '' || (k === 'page' && v === 1)) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };
  return { status, q, page, set, args: { status: status || undefined, q: q || undefined, page } };
}
