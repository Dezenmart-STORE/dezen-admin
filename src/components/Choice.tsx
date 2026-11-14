import type { ReactNode } from 'react';
import { Money } from './ui';

/**
 * One side of a decision: who gets what, said in full. Both sides of a ruling are equal in weight
 * and equally deliberate; choosing one opens the money sheet.
 */
export function Choice({
  title,
  amount,
  currency,
  ngn,
  consequence,
  onChoose,
  disabled,
}: {
  title: string;
  amount: number;
  currency?: string;
  ngn?: number;
  consequence: ReactNode;
  onChoose: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      disabled={disabled}
      className="group flex w-full cursor-pointer flex-col items-start gap-1.5 rounded-leaf border border-line bg-surface p-5 text-left transition-colors hover:border-ink-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="text-[22px]">
        <Money amount={amount} currency={currency} ngn={ngn} />
      </span>
      <span className="text-[13px] text-ink-2">{consequence}</span>
      <span className="mt-2 text-[13px] font-semibold underline-offset-4 group-hover:underline">Choose →</span>
    </button>
  );
}

/** Who may take an action this person can't: said plainly on the locked button. */
export const WHO = {
  move_money: 'Finance',
  verify: 'Reviewers',
  read_pii: 'Finance',
  staff_admin: 'Owners',
} as const;
