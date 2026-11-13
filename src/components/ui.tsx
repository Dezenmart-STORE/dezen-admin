import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

/** Shared building blocks. Pages use these rather than styling their own. */

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-ink hover:bg-accent-hover',
  secondary: 'bg-raised text-ink border border-line hover:border-muted',
  danger: 'bg-transparent text-bad border border-bad/50 hover:bg-bad/10',
  ghost: 'bg-transparent text-muted hover:text-ink',
};

export function Button({
  variant = 'secondary',
  busy,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {busy && <Spinner small />}
      {children}
    </button>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-muted border-t-transparent ${small ? 'h-3.5 w-3.5' : 'h-6 w-6'}`}
    />
  );
}

export function Loading() {
  return (
    <div className="flex justify-center py-12">
      <Spinner />
    </div>
  );
}

type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info';
const tones: Record<Tone, string> = {
  neutral: 'bg-raised text-muted',
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad',
  info: 'bg-info/15 text-info',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

/** Words the operator reads for a status the backend sends. */
const STATUS_WORDS: Record<string, string> = {
  rider_accepted: 'Rider confirmed',
  in_transit: 'On the way',
  picked_up: 'Picked up',
  refund_pending: 'Refund sent',
  refund_failed: 'Refund failed',
  manual: 'Pay by hand',
  verified: 'Approved',
};

/** A status word coloured by what it means for the operator. */
export function StatusBadge({ status }: { status: string }) {
  const tone: Tone = /approved|verified|completed|delivered|paid|success|released|^done$|refunded/.test(status)
    ? 'ok'
    : /pending|awaiting|processing|preparing|ready|in_transit|accepted|picked_up|shipped|manual/.test(status)
      ? 'warn'
      : /rejected|failed|suspended|disputed|cancel|refused/.test(status)
        ? 'bad'
        : 'neutral';
  const words = STATUS_WORDS[status] ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
  return <Badge tone={tone}>{words}</Badge>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-card ${className}`}>{children}</section>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
      {children}
    </p>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-12 text-center text-sm text-muted">{children}</p>;
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex flex-wrap gap-1 rounded-lg border border-line bg-card p-1 w-fit">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm cursor-pointer ${value === o.value ? 'bg-raised text-ink' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const control =
  'w-full rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-info focus:outline-none';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${control} ${props.className ?? ''}`} />;
}

/** Six-digit authenticator code input. */
export function CodeInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <Input
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      placeholder="123456"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      className="text-center text-lg tracking-[0.4em] font-mono"
    />
  );
}

/** Label → value pairs for a record's details. */
export function KeyValues({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-6 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Pagination({ page, total, limit, onChange, busy }: { page: number; total: number; limit: number; onChange: (p: number) => void; busy?: boolean }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-end gap-3 text-sm text-muted">
      <Button disabled={page <= 1 || busy} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      Page {page} of {pages}
      <Button disabled={page >= pages || busy} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </nav>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>;
}
