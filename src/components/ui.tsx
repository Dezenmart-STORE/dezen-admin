import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import type { Service } from '../store/types';
import { Orbit, ServiceGlyph, StatusShape, type Shape } from './brand';

/**
 * The admin's building blocks. Every page uses these rather than styling its own.
 * Primary = the mark's white. Red only for "needs a person" and "cannot be undone".
 */

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:opacity-90',
  secondary: 'bg-surface text-ink border border-line hover:border-ink-3',
  quiet: 'bg-transparent text-ink-2 hover:text-ink hover:bg-raised',
  danger: 'bg-transparent text-need border border-need/45 hover:bg-need/10',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  busy,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; busy?: boolean }) {
  const sizes = { sm: 'h-8 px-3 text-[13px]', md: 'h-10 px-4 text-sm', lg: 'h-12 px-5 text-[15px]' };
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-leaf-sm font-semibold transition-[background-color,border-color,opacity,color] duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {busy && <Orbit size={14} label="Working" />}
      {children}
    </button>
  );
}

/** An action this person's role can't take: shown, not hidden, with who can. */
export function Locked({ children, who }: { children: ReactNode; who: string }) {
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button disabled title={`${who} can do this`}>
        {children}
      </Button>
      <span className="text-[11.5px] text-ink-3">{who} can do this</span>
    </span>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex justify-center py-16">
      <Orbit size={30} label={label} />
    </div>
  );
}

// ── status ───────────────────────────────────────────────────────────────────

type Tone = 'need' | 'settled' | 'waiting' | 'quiet';

const STATUS: Record<string, { word: string; shape: Shape; tone: Tone }> = {
  failed: { word: 'Failed', shape: 'petal', tone: 'need' },
  disputed: { word: 'Disputed', shape: 'petal', tone: 'need' },
  refund_failed: { word: 'Refund failed', shape: 'petal', tone: 'need' },
  to_refund: { word: 'Refund due', shape: 'petal', tone: 'need' },
  manual: { word: 'Pay by hand', shape: 'petal', tone: 'waiting' },
  pending: { word: 'Waiting', shape: 'ring', tone: 'waiting' },
  processing: { word: 'Sending', shape: 'ring', tone: 'waiting' },
  unpaid: { word: 'Not paid yet', shape: 'ring', tone: 'quiet' },
  accepted: { word: 'Accepted', shape: 'ring', tone: 'waiting' },
  rider_accepted: { word: 'Rider confirmed', shape: 'ring', tone: 'waiting' },
  preparing: { word: 'Preparing', shape: 'ring', tone: 'waiting' },
  ready: { word: 'Ready', shape: 'ring', tone: 'waiting' },
  picked_up: { word: 'Picked up', shape: 'ring', tone: 'waiting' },
  in_transit: { word: 'On the way', shape: 'ring', tone: 'waiting' },
  shipped: { word: 'Shipped', shape: 'ring', tone: 'waiting' },
  refund_pending: { word: 'Refund sent', shape: 'ring', tone: 'waiting' },
  delivered: { word: 'Delivered', shape: 'circle', tone: 'settled' },
  completed: { word: 'Completed', shape: 'circle', tone: 'settled' },
  paid: { word: 'Paid', shape: 'circle', tone: 'settled' },
  success: { word: 'Done', shape: 'circle', tone: 'settled' },
  refunded: { word: 'Refunded', shape: 'circle', tone: 'settled' },
  approved: { word: 'Approved', shape: 'circle', tone: 'settled' },
  verified: { word: 'Approved', shape: 'circle', tone: 'settled' },
  done: { word: 'Done', shape: 'circle', tone: 'settled' },
  rejected: { word: 'Rejected', shape: 'circle', tone: 'quiet' },
  cancelled: { word: 'Cancelled', shape: 'circle', tone: 'quiet' },
  suspended: { word: 'Suspended', shape: 'petal', tone: 'need' },
  reversed: { word: 'Reversed', shape: 'circle', tone: 'quiet' },
};

const TONE_TEXT: Record<Tone, string> = { need: 'text-need', settled: 'text-settled', waiting: 'text-waiting', quiet: 'text-ink-3' };

/** A status: its shape and its word. Petal = needs a person, ring = on its way, circle = settled. */
export function Status({ status, word }: { status: string; word?: string }) {
  const s = STATUS[status] ?? { word: status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' '), shape: 'circle' as Shape, tone: 'quiet' as Tone };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium ${TONE_TEXT[s.tone]}`}>
      <StatusShape shape={s.shape} tone={s.tone} size={9} />
      {word ?? s.word}
    </span>
  );
}
/** Kept for older call sites. */
export const StatusBadge = Status;

/** A neutral tag (roles, categories). Not for status: use Status. */
export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'need' | 'settled' | 'waiting' }) {
  const t = { neutral: 'border-line text-ink-2', need: 'border-need/40 text-need', settled: 'border-settled/40 text-settled', waiting: 'border-waiting/40 text-waiting' }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${t}`}>{children}</span>;
}
/** Kept for older call sites. */
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'info' }) {
  const map = { neutral: 'neutral', ok: 'settled', warn: 'waiting', bad: 'need', info: 'neutral' } as const;
  return <Tag tone={map[tone]}>{children}</Tag>;
}

// ── money ────────────────────────────────────────────────────────────────────

const naira = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Money, always in full with its currency. Never abbreviated. */
export function Money({ amount, currency = 'NGN', className = '' }: { amount: number | null | undefined; currency?: string; className?: string }) {
  if (typeof amount !== 'number') return <span className="text-ink-3">—</span>;
  const text = currency === 'NGN' ? `₦${naira.format(amount)}` : `${amount.toLocaleString('en-NG')} ${currency}`;
  return <span className={`font-mono font-medium whitespace-nowrap ${className}`}>{text}</span>;
}

// ── layout pieces ────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  actions,
  service,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  service?: Service;
  eyebrow?: string;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {(eyebrow || service) && (
          <p className="mb-2.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
            {service && <ServiceGlyph service={service} size={15} />}
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-[26px] leading-[1.05] sm:text-[30px] text-balance">{title}</h1>
        {description && <p className="mt-2 max-w-[62ch] text-[14.5px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-leaf border border-line bg-surface ${className}`}>{children}</section>;
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-3">{children}</h2>
      {aside}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex items-start gap-2.5 rounded-leaf-sm border border-need/35 bg-need/[0.07] px-3.5 py-2.5 text-sm text-ink">
      <span className="mt-[5px]">
        <StatusShape shape="petal" tone="need" size={9} />
      </span>
      <span>{children}</span>
    </p>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-leaf-sm border border-line bg-raised px-3.5 py-2.5 text-sm text-ink-2">
      <span className="mt-[5px]">
        <StatusShape shape="ring" tone="quiet" size={9} />
      </span>
      <span>{children}</span>
    </p>
  );
}

/** Nothing to show. When a queue is empty, it reads as settled: four circles. */
export function Empty({ children, settled }: { children: ReactNode; settled?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {settled && (
        <span aria-hidden className="grid grid-cols-2 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-2.5 w-2.5 rounded-full bg-settled" style={{ opacity: 0.4 + i * 0.2 }} />
          ))}
        </span>
      )}
      <p className="text-sm text-ink-2">{children}</p>
    </div>
  );
}

/** Choose one view: filter chips that scroll sideways on a phone. */
export function Segments<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`h-8 shrink-0 cursor-pointer rounded-full border px-3.5 text-[13px] font-medium transition-colors ${on ? 'border-transparent bg-primary text-on-primary' : 'border-line text-ink-2 hover:text-ink hover:border-ink-3'}`}
          >
            {o.label}
            {typeof o.count === 'number' && <span className={`ml-1.5 font-mono text-[11.5px] ${on ? 'opacity-70' : 'text-ink-3'}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
/** Kept for older call sites. */
export const Tabs = Segments;

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

const control =
  'h-11 w-full rounded-leaf-sm border border-line bg-ground px-3.5 text-[14.5px] text-ink placeholder:text-ink-3 transition-colors focus:border-ink-2 focus:outline-none';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${control} cursor-pointer pr-8 ${props.className ?? ''}`} />;
}

/** Six-digit authenticator code. */
export function CodeInput({ value, onChange, autoFocus, id }: { value: string; onChange: (v: string) => void; autoFocus?: boolean; id?: string }) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      placeholder="• • • • • •"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      className="text-center font-mono text-xl tracking-[0.5em]"
    />
  );
}

/** Label → value pairs for a record's facts. */
export function KeyValues({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-6 gap-y-2.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
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
    <nav aria-label="Pages" className="mt-5 flex items-center justify-between gap-3 text-sm text-ink-3">
      <span className="font-mono text-xs">
        {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
      </span>
      <span className="flex gap-2">
        <Button size="sm" disabled={page <= 1 || busy} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button size="sm" disabled={page >= pages || busy} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </span>
    </nav>
  );
}

/** A spinner inside a button or a small space. */
export function Spinner({ small }: { small?: boolean }) {
  return <Orbit size={small ? 14 : 24} />;
}
