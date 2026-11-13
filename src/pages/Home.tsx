import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../lib/errors';
import { useQueuesQuery, useSearchQuery } from '../store/api';
import type { SearchResult } from '../store/types';
import { Badge, Card, Empty, ErrorNote, Loading, PageHeader } from '../components/ui';

const SERVICE: Record<string, string> = { food: 'DezenFoods', express: 'DezenExpress', shopping: 'Shopping', platform: 'Dezenmart' };

const age = (iso?: string) => {
  if (!iso) return null;
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  return h < 1 ? 'under an hour' : h < 48 ? `${Math.floor(h)} hours` : `${Math.floor(h / 24)} days`;
};

/** What needs someone: money first, then reviews. Empty queues drop to the bottom. */
export function Home() {
  const { data, isLoading, error } = useQueuesQuery(undefined, { pollingInterval: 60_000 });
  const sorted = [...(data ?? [])].sort((a, b) => Number(!!b.count) - Number(!!a.count) || Number(!!b.urgent) - Number(!!a.urgent) || (a.oldestAt ?? '').localeCompare(b.oldestAt ?? ''));
  return (
    <>
      <PageHeader title="Home" description="What is waiting for someone. Money comes first." />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorNote>{errorMessage(error)}</ErrorNote>
      ) : !sorted.length ? (
        <p className="text-sm text-muted">Your access has no queues. Use the menu to find what you can see.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((q) => (
            <Link key={q.key} to={q.link} className="block">
              <Card className={`h-full p-5 hover:border-muted ${q.count && q.urgent ? 'border-bad/50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-muted">{q.label}</p>
                  <Badge>{SERVICE[q.service]}</Badge>
                </div>
                <p className={`mt-2 text-3xl font-semibold ${q.count && q.urgent ? 'text-bad' : q.count ? '' : 'text-muted'}`}>{q.count}</p>
                {q.count > 0 && q.oldestAt && <p className="mt-1 text-xs text-muted">Oldest waiting {age(q.oldestAt)}</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

const KIND: Record<SearchResult['kind'], string> = { person: 'People', order: 'Orders', booking: 'Trips', payment: 'Payments', vendor: 'Vendors', rider: 'Riders' };

/** One box for everything: names, emails, phones, order and trip references, payment references. */
export function Search() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const { data, isFetching, error } = useSearchQuery(q, { skip: q.trim().length < 2 });
  const groups = Object.entries(KIND)
    .map(([kind, label]) => ({ label, items: (data ?? []).filter((r) => r.kind === kind) }))
    .filter((g) => g.items.length);
  return (
    <>
      <PageHeader title={q ? `Results for “${q}”` : 'Search'} description="Names, emails, phone numbers, order and trip references, and payment references." />
      {q.trim().length < 2 ? (
        <p className="text-sm text-muted">Type at least two characters in the search box above.</p>
      ) : isFetching ? (
        <Loading />
      ) : error ? (
        <ErrorNote>{errorMessage(error)}</ErrorNote>
      ) : !groups.length ? (
        <Card>
          <Empty>Nothing matches “{q}”.</Empty>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{g.label}</h2>
              <Card>
                <ul className="divide-y divide-line">
                  {g.items.map((r) => (
                    <li key={`${r.kind}-${r.id}`}>
                      <Link to={r.link} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-raised">
                        <span className="min-w-0">
                          <span className="block font-medium">{r.title}</span>
                          <span className="block truncate text-xs text-muted">{r.subtitle}</span>
                        </span>
                        <Badge>{SERVICE[r.service]}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
