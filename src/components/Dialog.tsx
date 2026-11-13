import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { MoneyReceipt } from '../store/types';
import { Settle } from './brand';
import { Button, CodeInput, ErrorNote, Field, Input, Money } from './ui';

/**
 * A sheet on the native <dialog> (focus trapped, Escape closes). On a phone it fills the screen
 * and its actions sit at the bottom; from tablet width it is a centred panel.
 * While `locked`, nothing can close it: used while money is in flight.
 */
export function Dialog({
  open,
  title,
  eyebrow,
  onClose,
  locked,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  eyebrow?: ReactNode;
  onClose: () => void;
  locked?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!locked) onClose();
      }}
      aria-labelledby="sheet-title"
      className="bg-surface p-0 text-ink backdrop:bg-black/60 max-md:m-0 max-md:h-dvh max-md:max-h-none max-md:w-full max-md:max-w-none md:m-auto md:max-h-[calc(100dvh-4rem)] md:w-[min(34rem,calc(100vw-2rem))] md:rounded-leaf md:border md:border-line"
    >
      {open && (
        <div className="flex flex-col animate-[sheet-up_320ms_var(--ease-settle)] max-md:h-full md:max-h-[calc(100dvh-4rem)]">
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] md:px-6 md:pt-5">
            <div className="min-w-0">
              {eyebrow && <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">{eyebrow}</p>}
              <h2 id="sheet-title" className="text-lg font-semibold">
                {title}
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close"
              disabled={locked}
              onClick={onClose}
              className="-mr-2 grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full border border-line text-2xl leading-none text-ink-2 hover:bg-raised hover:text-ink disabled:opacity-30"
            >
              ×
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">{children}</div>
          {footer && <footer className="border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 md:px-6">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

export type ConfirmResult = { receipt?: MoneyReceipt; error?: string };

/**
 * The money ritual. Every action that moves money looks and works the same:
 *  the amount large and in full, who receives it, whether it can be undone;
 *  type the amount, give a reason, enter the code; the button names action, amount and person.
 * Nothing closes it while the request is in flight. It ends in a receipt from the server.
 */
export function MoneySheet({
  open,
  eyebrow,
  title,
  amount,
  currency = 'NGN',
  recipient,
  consequence,
  irreversible = true,
  actionLabel,
  danger,
  children,
  extraReady = true,
  onClose,
  onConfirm,
}: {
  open: boolean;
  eyebrow?: ReactNode;
  title: string;
  amount: number;
  currency?: string;
  recipient: { name: string; detail?: string };
  consequence: ReactNode;
  irreversible?: boolean;
  /** Names the action, amount and person: "Refund ₦3,450 to Musa". */
  actionLabel: string;
  danger?: boolean;
  /** Extra fields (a transfer reference, a direction); the caller keeps their state. */
  children?: ReactNode;
  extraReady?: boolean;
  onClose: () => void;
  onConfirm: (input: { code: string; reason: string }) => Promise<ConfirmResult>;
}) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<MoneyReceipt | null>(null);

  useEffect(() => {
    if (open) {
      setTyped('');
      setReason('');
      setCode('');
      setError('');
      setDone(null);
    }
  }, [open]);

  const amountOk = Number(typed.replace(/[,\s₦]/g, '')) === amount;
  const ready = amountOk && reason.trim().length > 2 && code.length === 6 && extraReady;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    const res = await onConfirm({ code, reason: reason.trim() });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      setCode('');
    } else if (res.receipt) setDone(res.receipt);
    else onClose();
  };

  if (done) {
    return (
      <Dialog
        open={open}
        title={done.state === 'sent' ? 'Sent' : 'Recorded'}
        onClose={onClose}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            {done.next && (
              <Link to={done.next.link} onClick={onClose} className="mr-auto self-center text-sm font-semibold underline-offset-4 hover:underline">
                {done.next.label} →
              </Link>
            )}
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        }
      >
        <div aria-live="polite" className="flex flex-col items-start gap-5">
          <Settle size={44} />
          <div>
            <p className="font-mono text-3xl font-semibold tracking-tight">
              <Money amount={done.amount} currency={done.currency} />
            </p>
            <p className="mt-1 text-[15px] text-ink-2">
              {done.state === 'sent' ? 'sent to' : 'recorded for'} <span className="font-semibold text-ink">{done.recipient}</span>
            </p>
          </div>
          <dl className="grid w-full grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-t border-line pt-4 text-sm">
            <dt className="text-ink-3">Reference</dt>
            <dd className="font-mono">{done.reference}</dd>
            <dt className="text-ink-3">When</dt>
            <dd className="font-mono">{new Date(done.at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</dd>
            <dt className="text-ink-3">By</dt>
            <dd className="font-mono">{done.by}</dd>
          </dl>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      title={title}
      eyebrow={eyebrow}
      onClose={onClose}
      locked={busy}
      footer={
        <Button variant={danger ? 'danger' : 'primary'} size="lg" className="w-full" disabled={!ready} busy={busy} onClick={() => submit()}>
          {busy ? 'Sending…' : actionLabel}
        </Button>
      }
    >
      <form onSubmit={submit} className="space-y-5" autoComplete="off">
        <div>
          <p className="font-mono text-[40px] font-semibold leading-none tracking-tight">
            <Money amount={amount} currency={currency} />
          </p>
          <div className="mt-4 flex items-center gap-3">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-raised text-[13px] font-semibold">
              {initials(recipient.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{recipient.name}</span>
              {recipient.detail && <span className="block truncate text-[13px] text-ink-3">{recipient.detail}</span>}
            </span>
          </div>
        </div>
        <div className="space-y-1.5 rounded-leaf-sm bg-raised px-3.5 py-3 text-sm text-ink-2">
          <p>{consequence}</p>
          {irreversible && <p className="font-semibold text-ink">This cannot be undone.</p>}
        </div>
        {children}
        <Field
          label="Type the amount to confirm"
          hint={!typed ? `Type ${amount.toLocaleString('en-NG')} exactly, without the currency.` : amountOk ? 'Matches.' : 'That does not match the amount above.'}
        >
          <Input inputMode="decimal" value={typed} onChange={(e) => setTyped(e.target.value)} className="font-mono" />
        </Field>
        <Field label="Reason" hint="Saved with your name in the activity log.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
        <Field label="Code from your authenticator app">
          <CodeInput value={code} onChange={setCode} />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

/** A change that moves no money but needs the code (staff access, settings). */
export function CodeSheet({
  open,
  title,
  eyebrow,
  summary,
  actionLabel,
  askReason,
  danger,
  children,
  extraReady = true,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  eyebrow?: ReactNode;
  summary: ReactNode;
  actionLabel: string;
  askReason?: boolean;
  danger?: boolean;
  children?: ReactNode;
  extraReady?: boolean;
  onClose: () => void;
  onConfirm: (input: { code: string; reason?: string }) => Promise<string | null>;
}) {
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setCode('');
      setReason('');
      setError('');
    }
  }, [open]);
  const ready = code.length === 6 && extraReady && (!askReason || reason.trim().length > 2);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    const failure = await onConfirm({ code, reason: askReason ? reason.trim() : undefined });
    setBusy(false);
    if (failure) {
      setError(failure);
      setCode('');
    } else onClose();
  };
  return (
    <Dialog
      open={open}
      title={title}
      eyebrow={eyebrow}
      onClose={onClose}
      locked={busy}
      footer={
        <Button variant={danger ? 'danger' : 'primary'} size="lg" className="w-full" disabled={!ready} busy={busy} onClick={() => submit()}>
          {actionLabel}
        </Button>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="text-[15px] text-ink-2">{summary}</div>
        {children}
        {askReason && (
          <Field label="Reason" hint="Saved with your name in the activity log.">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
        )}
        <Field label="Code from your authenticator app">
          <CodeInput value={code} onChange={setCode} autoFocus />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
/** Kept for older call sites. */
export const ConfirmWithCode = CodeSheet;

/** A change that moves no money and needs no code (approve, reject, hide). */
export function ConfirmDialog({
  open,
  title,
  summary,
  actionLabel,
  askReason,
  reasonHint = 'Saved with your name in the activity log.',
  danger,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  summary: ReactNode;
  actionLabel: string;
  askReason?: boolean;
  reasonHint?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<string | null>;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setReason('');
      setError('');
    }
  }, [open]);
  const ready = !askReason || reason.trim().length > 2;
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    const failure = await onConfirm(askReason ? reason.trim() : undefined);
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  };
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      locked={busy}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={!ready} busy={busy} onClick={() => submit()}>
            {actionLabel}
          </Button>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="text-[15px] text-ink-2">{summary}</div>
        {askReason && (
          <Field label="Reason" hint={reasonHint}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
          </Field>
        )}
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
