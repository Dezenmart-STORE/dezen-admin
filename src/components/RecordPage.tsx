import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import type { TimelineEntry } from '../store/types';
import { Timeline } from './Timeline';
import { Card, ErrorNote, Loading, SectionTitle } from './ui';

/** The layout every single-record page shares: back link, title, actions, details, then history. */
export function RecordPage({
  back,
  backLabel,
  title,
  badge,
  actions,
  loading,
  error,
  details,
  timeline,
  children,
}: {
  back: string;
  backLabel: string;
  title: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  loading: boolean;
  error?: string;
  details?: ReactNode;
  timeline?: TimelineEntry[];
  children?: ReactNode;
}) {
  return (
    <>
      <Link to={back} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <FiArrowLeft aria-hidden /> {backLabel}
      </Link>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNote>{error}</ErrorNote>
      ) : (
        <>
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">{title}</h1>
              {badge}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </header>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="space-y-6">
              {details && <Card className="p-5">{details}</Card>}
              {children}
            </div>
            {timeline && (
              <Card className="p-5">
                <SectionTitle>History</SectionTitle>
                <Timeline entries={timeline} />
              </Card>
            )}
          </div>
        </>
      )}
    </>
  );
}
