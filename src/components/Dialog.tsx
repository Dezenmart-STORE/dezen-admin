import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, CodeInput, ErrorNote, Field, Input } from './ui';

/** A modal on the native <dialog>: focus is trapped and Escape closes it. */
export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
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
      onClose={onClose}
      aria-labelledby="dialog-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line bg-card p-0 text-ink"
    >
      {open && (
        <div className="p-6">
          <h2 id="dialog-title" className="mb-4 text-lg font-semibold">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

/**
 * Confirms a money or staff change with a fresh authenticator code.
 * With `amount`, the operator also types the amount, so a wrong order is caught before it pays.
 * With `askReason`, a reason is required and saved in the activity log.
 */
export function ConfirmWithCode({
  open,
  title,
  summary,
  actionLabel,
  amount,
  askReason,
  danger,
  children,
  extraReady = true,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  summary: ReactNode;
  actionLabel: string;
  amount?: number;
  askReason?: boolean;
  danger?: boolean;
  /** Extra fields for this action (a transfer reference, an amount); the caller keeps their state. */
  children?: ReactNode;
  extraReady?: boolean;
  onClose: () => void;
  onConfirm: (input: { code: string; reason?: string }) => Promise<string | null>;
}) {
  const [code, setCode] = useState('');
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCode('');
      setTyped('');
      setReason('');
      setError('');
    }
  }, [open]);

  const amountOk = amount === undefined || Number(typed.replace(/[,\s₦]/g, '')) === amount;
  const ready = code.length === 6 && amountOk && extraReady && (!askReason || reason.trim().length > 2);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError('');
    const failure = await onConfirm({ code, reason: askReason ? reason.trim() : undefined });
    setBusy(false);
    if (failure) {
      setError(failure);
      setCode('');
    } else onClose();
  };

  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-sm text-muted">{summary}</div>
        {children}
        {amount !== undefined && (
          <Field label="Type the amount to confirm" hint={`Exactly ${amount.toLocaleString('en-NG')}`}>
            <Input inputMode="decimal" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="0" />
          </Field>
        )}
        {askReason && (
          <Field label="Reason" hint="Saved in the activity log">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
        )}
        <Field label="Code from your authenticator app">
          <CodeInput value={code} onChange={setCode} autoFocus />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={!ready} busy={busy}>
            {actionLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Confirms a change that moves no money (approve, reject, hide). Asks for a reason when given one. */
export function ConfirmDialog({
  open,
  title,
  summary,
  actionLabel,
  askReason,
  reasonHint = 'Saved in the activity log',
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
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    const failure = await onConfirm(askReason ? reason.trim() : undefined);
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  };
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-sm text-muted">{summary}</div>
        {askReason && (
          <Field label="Reason" hint={reasonHint}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
          </Field>
        )}
        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={!ready} busy={busy}>
            {actionLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
