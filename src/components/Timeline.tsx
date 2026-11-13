import { FiCreditCard, FiFlag, FiMessageSquare, FiUser } from 'react-icons/fi';
import type { TimelineEntry } from '../store/types';
import { formatDate } from '../lib/format';

const ICONS = { status: FiFlag, payment: FiCreditCard, staff: FiUser, message: FiMessageSquare };

/** A record's history, oldest first: status changes, money and staff actions, with names. */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="space-y-4">
      {entries.map((e, i) => {
        const Icon = ICONS[e.kind];
        return (
          <li key={i} className="flex gap-3">
            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${e.kind === 'staff' ? 'bg-info/15 text-info' : 'bg-raised text-muted'}`}>
              <Icon aria-hidden className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm">{e.text}</p>
              <p className="text-xs text-muted">
                {formatDate(e.at)}
                {e.actor && ` · ${e.actor}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
