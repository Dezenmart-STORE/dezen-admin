import type { TimelineEntry } from '../store/types';
import { formatDate } from '../lib/format';

/**
 * A record's history, oldest first. Finished steps are circles; the latest step is a petal when it
 * still needs someone (a failure, a dispute), so the eye lands on what is open. Staff actions carry a name.
 */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  const open = (e: TimelineEntry) => /fail|dispute|waiting|cancel/i.test(e.text);
  return (
    <ol className="relative">
      {entries.map((e, i) => {
        const last = i === entries.length - 1;
        const petal = last && open(e);
        const colour = e.kind === 'staff' ? 'var(--ink)' : petal ? 'var(--need)' : e.kind === 'payment' ? 'var(--settled)' : 'var(--ink-3)';
        return (
          <li key={i} className="relative grid grid-cols-[18px_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
            {!last && <span aria-hidden className="absolute bottom-0 left-[8.5px] top-4 w-px bg-line" />}
            <span
              aria-hidden
              className="relative z-10 mt-1 h-[11px] w-[11px] justify-self-center"
              style={{
                background: e.kind === 'staff' ? 'var(--ground)' : colour,
                boxShadow: e.kind === 'staff' ? `inset 0 0 0 2px ${colour}` : `0 0 0 4px var(--ground)`,
                borderRadius: petal ? '50% 50% 0 50%' : '50%',
                transform: petal ? 'rotate(45deg)' : undefined,
              }}
            />
            <div className="min-w-0">
              <p className={`text-[14px] ${petal ? 'font-semibold' : ''}`}>{e.text}</p>
              <p className="mt-0.5 font-mono text-[11.5px] text-ink-3">
                {formatDate(e.at)}
                {e.actor && <span className="text-ink-2"> · {e.actor}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
