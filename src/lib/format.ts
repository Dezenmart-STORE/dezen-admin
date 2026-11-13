const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });

export const formatNaira = (n: number | null | undefined) => (typeof n === 'number' ? naira.format(n) : '—');

export const formatDate = (iso: string | Date | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

/** "awaiting_payment" → "Awaiting payment" */
export const humanize = (s: string | null | undefined) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '—');
