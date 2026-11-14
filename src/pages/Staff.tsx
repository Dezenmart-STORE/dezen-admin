import { useState } from 'react';
import { errorMessage, failureOf } from '../lib/errors';
import { formatDate } from '../lib/format';
import { useAppSelector } from '../store';
import { useGrantStaffMutation, useStaffActionMutation, useStaffQuery } from '../store/api';
import type { StaffMember } from '../store/types';
import { Table } from '../components/Table';
import { ConfirmWithCode } from '../components/Dialog';
import { Button, Card, Field, Input, PageHeader, Select, Status } from '../components/ui';

export const SERVICE_LABELS: Record<string, string> = {
  '*': 'All services',
  food: 'DezenFoods',
  express: 'DezenExpress',
  shopping: 'Shopping',
  platform: 'People, money and settings',
};

export const CAPABILITY_LABELS: Record<string, string> = {
  support: 'Read records',
  verify: 'Approve and hide',
  read_pii: 'Full personal details',
  move_money: 'Refunds and payouts',
  chain_ops: 'Carry out Shopping rulings',
  staff_admin: 'Manage staff and settings',
};

const PRESET_LABELS: Record<string, string> = {
  support: 'Support: read orders, trips and records',
  verifier: 'Reviewer: support, plus approve vendors, riders and products',
  finance: 'Finance: support, plus refunds, payouts and full personal details',
  owner: 'Owner: everything, including staff and settings',
};

const SERVICES = ['food', 'express', 'shopping', 'platform'];
type Action = { member: StaffMember; action: 'disable' | 'enable' | 'reset-authenticator' };

const ACTION_TEXT = {
  disable: { title: 'Remove access', text: 'They are signed out now and cannot sign in again until access is restored.' },
  enable: { title: 'Restore access', text: 'They can sign in again with the access they had.' },
  'reset-authenticator': { title: 'Reset authenticator', text: 'For a lost phone. They are signed out and set up their authenticator again at their next sign-in.' },
};

export function Staff() {
  const me = useAppSelector((s) => s.session.access?.email);
  const { data, isLoading, error } = useStaffQuery();
  const [act] = useStaffActionMutation();
  const [grant] = useGrantStaffMutation();
  const [acting, setActing] = useState<Action | null>(null);
  const [form, setForm] = useState({ email: '', preset: 'support', services: [] as string[] });
  const [granting, setGranting] = useState(false);

  const toggle = (s: string) =>
    setForm((f) => {
      if (s === '*') return { ...f, services: f.services.includes('*') ? [] : ['*'] };
      const rest = f.services.filter((x) => x !== '*');
      return { ...f, services: rest.includes(s) ? rest.filter((x) => x !== s) : [...rest, s] };
    });
  const formReady = /^\S+@\S+\.\S+$/.test(form.email.trim()) && form.services.length > 0;

  return (
    <>
      <PageHeader eyebrow="Team" title="Staff" description="Who can use this admin, what they can do, and where." />

      <Card className="mb-6 p-5">
        <h2 className="mb-4 font-medium">Give someone access</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Google email" hint="They must have signed in to Dezenmart once with this account.">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Role">
            <Select value={form.preset} onChange={(e) => setForm({ ...form, preset: e.target.value })}>
              {Object.keys(PRESET_LABELS).map((p) => (
                <option key={p} value={p}>
                  {PRESET_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium">Where</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {['*', ...SERVICES].map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="accent-accent" checked={form.services.includes(s) || (s !== '*' && form.services.includes('*'))} disabled={s !== '*' && form.services.includes('*')} onChange={() => toggle(s)} />
                {SERVICE_LABELS[s]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" disabled={!formReady} onClick={() => setGranting(true)}>
            Give access
          </Button>
        </div>
      </Card>

      <Table
        rows={data?.staff}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(s) => s.id}
        empty="No staff yet."
        columns={[
          {
            header: 'Person',
            cell: (s) => (
              <>
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-muted">{s.email}</p>
              </>
            ),
          },
          {
            header: 'Can',
            cell: (s) => <span className="block max-w-[34ch] text-[13.5px] text-ink-2">{canWords(s.capabilities)}</span>,
          },
          { header: 'Where', cell: (s) => <span className="text-sm">{s.services.map((x) => SERVICE_LABELS[x] ?? x).join(', ')}</span> },
          {
            header: 'Status',
            cell: (s) => (s.disabled ? <Status status="cancelled" word="No access" /> : s.authenticatorSet ? <Status status="done" word="Active" /> : <Status status="pending" word="Not signed in yet" />),
          },
          { header: 'Last sign-in', cell: (s) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(s.lastSignInAt)}</span> },
          {
            header: '',
            cell: (s) =>
              s.email === me ? (
                <span className="text-xs text-ink-3">You</span>
              ) : s.capabilities.includes('staff_admin') && !s.disabled ? (
                <span className="text-[12px] text-ink-3" title="An owner cannot be removed here. Another owner changes it with the founder's approval.">
                  Owner · protected
                </span>
              ) : s.disabled ? (
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setActing({ member: s, action: 'enable' })}>
                    Restore access
                  </Button>
                </div>
              ) : (
                <ManageMenu
                  name={s.name}
                  items={[
                    ...(s.authenticatorSet ? [{ label: 'Reset authenticator', onSelect: () => setActing({ member: s, action: 'reset-authenticator' }) }] : []),
                    { label: 'Remove access', danger: true, onSelect: () => setActing({ member: s, action: 'disable' }) },
                  ]}
                />
              ),
          },
        ]}
      />

      <ConfirmWithCode
        open={granting}
        title="Give access"
        summary={
          <>
            <strong className="text-ink">{form.email.trim()}</strong> gets {PRESET_LABELS[form.preset].split(':')[0]} access to{' '}
            {form.services.map((s) => SERVICE_LABELS[s]).join(', ')}. If they already have access, it is replaced and they are signed out.
          </>
        }
        actionLabel="Give access"
        onClose={() => setGranting(false)}
        onConfirm={async ({ code }) => {
          const failure = failureOf(await grant({ ...form, email: form.email.trim(), code }));
          if (!failure) setForm({ email: '', preset: 'support', services: [] });
          return failure;
        }}
      />
      <ConfirmWithCode
        open={!!acting}
        title={acting ? ACTION_TEXT[acting.action].title : ''}
        summary={acting && <>{acting.member.email}. {ACTION_TEXT[acting.action].text}</>}
        actionLabel={acting ? ACTION_TEXT[acting.action].title : ''}
        danger={acting?.action === 'disable'}
        onClose={() => setActing(null)}
        onConfirm={async ({ code }) => failureOf(await act({ id: acting!.member.id, action: acting!.action, code }))}
      />
    </>
  );
}

/** What someone can do, said as one plain sentence rather than a row of tags. */
function canWords(caps: string[]) {
  const parts = ['Reads records'];
  if (caps.includes('verify')) parts.push('approves newcomers and products');
  if (caps.includes('move_money')) parts.push('sends refunds and payouts');
  if (caps.includes('read_pii')) parts.push('sees full personal details');
  if (caps.includes('staff_admin')) return 'Everything, including staff and settings';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Rare, serious actions live behind a menu instead of a red button on every row,
 * so a stray click never starts removing someone.
 */
function ManageMenu({ name, items }: { name: string; items: { label: string; danger?: boolean; onSelect: () => void }[] }) {
  return (
    <details className="relative ml-auto w-fit [&[open]>summary]:bg-raised">
      <summary
        aria-label={`Manage ${name}`}
        className="flex h-9 cursor-pointer list-none items-center rounded-leaf-sm border border-line px-3 text-[13px] font-medium text-ink-2 hover:text-ink md:h-8"
      >
        Manage
      </summary>
      <div role="menu" className="absolute right-0 z-20 mt-1 min-w-[12rem] rounded-leaf-sm border border-line bg-surface p-1 shadow-lg">
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            onClick={(e) => {
              (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
              it.onSelect();
            }}
            className={`block w-full cursor-pointer rounded-[8px] px-3 py-2 text-left text-[13.5px] hover:bg-raised ${it.danger ? 'text-need' : ''}`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </details>
  );
}
