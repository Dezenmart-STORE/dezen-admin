import { useSearchParams } from 'react-router-dom';

/**
 * Filters and page live in the address, so a list can be linked to and survives a reload.
 * A page that opens on a default view (Reported, Needs someone) writes `status=all` for "All",
 * since an empty status would fall back to the default.
 */
export function useListParams(defaults: { status?: string } = {}) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('status');
  const status = raw === 'all' ? '' : (raw ?? defaults.status ?? '');
  const q = params.get('q') ?? '';
  const page = Number(params.get('page')) || 1;
  const set = (changes: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (k === 'status' && v === '' && defaults.status) next.set(k, 'all');
      else if (v === undefined || v === '' || (k === 'page' && v === 1)) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };
  return { status, q, page, set, args: { status: status || undefined, q: q || undefined, page } };
}
