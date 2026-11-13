import { useState } from 'react';
import { errorMessage, failureOf } from '../lib/errors';
import { formatDate, humanize } from '../lib/format';
import { useAppSelector } from '../store';
import { useGrantStaffMutation, useStaffActionMutation, useStaffQuery } from '../store/api';
import type { StaffMember } from '../store/types';
import { Table } from '../components/Table';
import { ConfirmWithCode } from '../components/Dialog';
import { Badge, Button, Card, Field, Input, PageHeader, Select } from '../components/ui';

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
      <PageHeader title="Staff" description="Who can use this admin, what they can do, and where." />

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
            cell: (s) => (
              <div className="flex max-w-72 flex-wrap gap-1">
                {s.capabilities.map((c) => (
                  <Badge key={c}>{CAPABILITY_LABELS[c] ?? humanize(c)}</Badge>
                ))}
              </div>
            ),
          },
          { header: 'Where', cell: (s) => <span className="text-sm">{s.services.map((x) => SERVICE_LABELS[x] ?? x).join(', ')}</span> },
          {
            header: 'Status',
            cell: (s) => (s.disabled ? <Badge tone="bad">No access</Badge> : s.authenticatorSet ? <Badge tone="ok">Active</Badge> : <Badge tone="warn">Not signed in yet</Badge>),
          },
          { header: 'Last sign-in', cell: (s) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(s.lastSignInAt)}</span> },
          {
            header: '',
            cell: (s) =>
              s.email === me ? (
                <span className="text-xs text-muted">You</span>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
                  {s.disabled ? (
                    <Button onClick={() => setActing({ member: s, action: 'enable' })}>Restore access</Button>
                  ) : (
                    <Button variant="danger" onClick={() => setActing({ member: s, action: 'disable' })}>
                      Remove access
                    </Button>
                  )}
                  {s.authenticatorSet && !s.disabled && (
                    <Button variant="ghost" onClick={() => setActing({ member: s, action: 'reset-authenticator' })}>
                      Reset authenticator
                    </Button>
                  )}
                </div>
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
