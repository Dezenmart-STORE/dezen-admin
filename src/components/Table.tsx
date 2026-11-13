import type { ReactNode } from 'react';
import { Card, Empty, ErrorNote, Loading } from './ui';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/** The list every page uses: loading, error and empty states included. */
export function Table<T>({
  rows,
  columns,
  rowKey,
  loading,
  error,
  empty,
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string;
  empty: string;
}) {
  if (loading) return <Loading />;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  return (
    <Card className="overflow-x-auto">
      {!rows?.length ? (
        <Empty>{empty}</Empty>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              {columns.map((c) => (
                <th key={c.header} scope="col" className={`px-4 py-3 font-medium ${c.className ?? ''}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-line last:border-0 align-top">
                {columns.map((c) => (
                  <td key={c.header} className={`px-4 py-3 ${c.className ?? ''}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
