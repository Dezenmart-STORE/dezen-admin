import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, ErrorNote } from './ui';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: 'right';
}

/** How a row reads on a phone: two lines on the left, amount and status on the right. */
export interface MobileRow {
  title: ReactNode;
  subtitle?: ReactNode;
  amount?: ReactNode;
  status?: ReactNode;
}

/**
 * Every list. Dense table from tablet width up; on a phone each row becomes a tap target.
 * First load shows placeholder rows; a refresh keeps the rows and shows a thin progress line.
 * With `href`, the whole row opens the record.
 */
export function Table<T>({
  rows,
  columns,
  rowKey,
  loading,
  fetching,
  error,
  empty,
  settledWhenEmpty,
  href,
  mobile,
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  fetching?: boolean;
  error?: string;
  empty: string;
  /** The list is a queue: empty means everything is done. */
  settledWhenEmpty?: boolean;
  href?: (row: T) => string;
  mobile?: (row: T) => MobileRow;
}) {
  if (error) return <ErrorNote>{error}</ErrorNote>;
  return (
    <Card className="relative overflow-hidden">
      {fetching && !loading && (
        <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 overflow-hidden">
          <span className="block h-full w-1/3 animate-[orbit_1.1s_infinite] bg-ink-3" />
        </span>
      )}
      {loading ? (
        <Skeleton />
      ) : !rows?.length ? (
        <Empty settled={settledWhenEmpty}>{empty}</Empty>
      ) : (
        <>
          {/* Phone: rows */}
          {mobile && (
            <ul className="divide-y divide-line md:hidden">
              {rows.map((row) => {
                const m = mobile(row);
                const body = (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 px-4 py-3.5">
                    <span className="min-w-0 truncate text-[15px] font-semibold">{m.title}</span>
                    <span className="text-right text-[15px]">{m.amount}</span>
                    <span className="min-w-0 truncate text-[12.5px] text-ink-3">{m.subtitle}</span>
                    <span className="text-right">{m.status}</span>
                  </div>
                );
                const link = href?.(row);
                return (
                  <li key={rowKey(row)}>
                    {link ? (
                      <Link to={link} data-nav-row className="block active:bg-raised focus-visible:bg-raised">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {/* Tablet and up: table */}
          <div className={`overflow-x-auto ${mobile ? 'hidden md:block' : ''}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {columns.map((c) => (
                    <th
                      key={c.header}
                      scope="col"
                      className={`whitespace-nowrap px-4 py-3 text-[12px] font-medium text-ink-3 ${c.align === 'right' ? 'text-right' : ''} ${c.className ?? ''}`}
                    >
                      {c.header || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const link = href?.(row);
                  return (
                    <tr key={rowKey(row)} className={`border-b border-line align-top last:border-0 ${link ? 'transition-colors hover:bg-raised' : ''}`}>
                      {columns.map((c, i) => (
                        <td key={c.header} className={`px-4 py-3.5 ${c.align === 'right' ? 'text-right' : ''} ${c.className ?? ''}`}>
                          {link && i === 0 ? (
                            <Link to={link} data-nav-row className="font-semibold underline-offset-4 hover:underline">
                              {c.cell(row)}
                            </Link>
                          ) : (
                            c.cell(row)
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function Skeleton() {
  return (
    <div aria-label="Loading" role="status" className="divide-y divide-line">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4" style={{ opacity: 1 - i * 0.16 }}>
          <span className="h-3 w-24 rounded-full bg-raised" />
          <span className="h-3 flex-1 rounded-full bg-raised" />
          <span className="h-3 w-16 rounded-full bg-raised" />
        </div>
      ))}
    </div>
  );
}
