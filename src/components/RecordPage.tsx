import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import type { Service, TimelineEntry } from '../store/types';
import { ServiceGlyph } from './brand';
import { Timeline } from './Timeline';
import { Card, ErrorNote, Loading, SectionTitle } from './ui';

/**
 * Every single record: back link, a header band (what it is, its state, the next action),
 * the facts and case on the left, the history on the right. On a phone the actions sit in a
 * bar fixed above the bottom tabs, so the decision is always in reach.
 */
export function RecordPage({
  back,
  backLabel,
  service,
  kind,
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
  service?: Service;
  kind?: string;
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
      <Link to={back} data-nav-back className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink">
        <FiArrowLeft aria-hidden /> {backLabel}
      </Link>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNote>{error}</ErrorNote>
      ) : (
        <>
          <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
            <div className="min-w-0">
              {(service || kind) && (
                <p className="mb-2.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
                  {service && <ServiceGlyph service={service} size={15} />}
                  {kind}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">{title}</h1>
                {badge}
              </div>
            </div>
            {actions && <div className="hidden flex-wrap gap-2 md:flex">{actions}</div>}
          </header>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-8">
            <div className="min-w-0 space-y-6">
              {details && <Card className="p-5 sm:p-6">{details}</Card>}
              {children}
            </div>
            {timeline && (
              <div className="min-w-0">
                <SectionTitle>History</SectionTitle>
                <Timeline entries={timeline} />
              </div>
            )}
          </div>
          {actions && (
            <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 flex gap-2 overflow-x-auto border-t border-line bg-sunk px-4 py-3 md:hidden [&>*]:flex-1">
              {actions}
            </div>
          )}
          {actions && <div aria-hidden className="h-20 md:hidden" />}
        </>
      )}
    </>
  );
}
