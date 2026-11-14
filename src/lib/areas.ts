/**
 * Going live one area at a time. While VITE_USE_SAMPLE_DATA is on, the areas listed in VITE_LIVE_AREAS
 * talk to the real backend and everything else stays on sample data, so each part of the admin can
 * switch over the day its endpoints land. Sign-in goes live with the first area, because a real
 * endpoint needs a real staff session.
 *
 *   VITE_LIVE_AREAS=food,approvals
 *
 * With VITE_USE_SAMPLE_DATA=false every area is live and this list is ignored.
 */
export const AREAS = ['auth', 'home', 'search', 'claims', 'approvals', 'food', 'express', 'shopping', 'people', 'money', 'settings', 'staff'] as const;
export type Area = (typeof AREAS)[number];

/** Which area a request path belongs to. Paths are relative to the API base, e.g. "/admin/food/orders". */
export function areaOf(path: string): Area | null {
  const p = path.split('?')[0];
  const rules: [RegExp, Area][] = [
    [/^\/admin\/auth\b/, 'auth'],
    [/^\/admin\/(home|queues?)\b/, 'home'],
    [/^\/admin\/search\b/, 'search'],
    [/^\/admin\/claims\b/, 'claims'],
    [/^\/admin\/approvals\b/, 'approvals'],
    [/^\/admin\/reviews\/vendor\b/, 'food'],
    [/^\/admin\/reviews\/(rider|provider)\b/, 'express'],
    [/^\/admin\/food\b/, 'food'],
    [/^\/admin\/express\b/, 'express'],
    [/^\/admin\/shopping\b/, 'shopping'],
    [/^\/admin\/platform\/users\b/, 'people'],
    [/^\/admin\/platform\/(payments|webhooks|reconciliation)\b/, 'money'],
    [/^\/admin\/platform\/settings\b/, 'settings'],
    [/^\/admin\/(staff|audit)\b/, 'staff'],
  ];
  return rules.find(([re]) => re.test(p))?.[1] ?? null;
}

/** Read the list once: unknown names are dropped and reported, so a typo never goes unnoticed. */
export function parseLiveAreas(raw: string | undefined): Set<Area> {
  const names = (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const known = new Set<Area>();
  for (const n of names) {
    if ((AREAS as readonly string[]).includes(n)) known.add(n as Area);
    else console.warn(`VITE_LIVE_AREAS: "${n}" is not an area. Use: ${AREAS.join(', ')}`);
  }
  if (known.size) known.add('auth');
  return known;
}

/** Whether a request goes to the real backend. */
export function isLive(path: string, sampleMode: boolean, live: Set<Area>): boolean {
  if (!sampleMode) return true;
  const area = areaOf(path);
  return !!area && live.has(area);
}
