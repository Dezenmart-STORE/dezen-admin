import { useState } from 'react';
import { errorMessage } from '../lib/errors';
import { formatDate, humanize } from '../lib/format';
import { useAppSelector } from '../store';
import { useGrantStaffMutation, useStaffActionMutation, useStaffQuery, type StaffMember } from '../store/api';
import { Table } from '../components/Table';
import { ConfirmWithCode } from '../components/Dialog';
import { Badge, Button, Card, Field, Input, PageHeader, Select } from '../components/ui';

const SERVICE_LABELS: Record<string, string> = {
  '*': 'All services',
  food: 'DezenFoods',
  express: 'DezenExpress',
  shopping: 'Shopping',
  platform: 'Platform',
};

const CAPABILITY_LABELS: Record<string, string> = {
  support: 'Read records',
  verify: 'Approve',
  read_pii: 'Full personal details',
  move_money: 'Refunds and payouts',
  chain_ops: 'Seller payment releases',
  staff_admin: 'Manage staff',
};

const PRESET_LABELS: Record<string, string> = {
  support: 'Support — read orders and records',
  verifier: 'Verifier — support, plus approve vendors and riders',
  finance: 'Finance — support, plus refunds, payouts and full personal details',
  owner: 'Owner — everything, including staff',
};

const emailOf = (s: StaffMember) => (typeof s.user === 'object' ? s.user.email : '—');

type Action = { member: StaffMember; action: 'disable' | 'enable' | 'reset-authenticator' };

export function Staff() {
  const me = useAppSelector((s) => s.session.access?.email);
  const { data, isLoading, error } = useStaffQuery();
  const [act] = useStaffActionMutation();
  const [grant] = useGrantStaffMutation();
  const [acting, setActing] = useState<Action | null>(null);
  const [form, setForm] = useState({ email: '', preset: 'support', services: [] as string[] });
  const [granting, setGranting] = useState(false);

  const toggleService = (s: string) =>
    setForm((f) => {
      if (s === '*') return { ...f, services: f.services.includes('*') ? [] : ['*'] };
      const rest = f.services.filter((x) => x !== '*');
      return { ...f, services: rest.includes(s) ? rest.filter((x) => x !== s) : [...rest, s] };
    });
  const formReady = /\S+@\S+\.\S+/.test(form.email) && form.services.length > 0;

  const actionText = {
    disable: { title: 'Remove access', label: 'Remove access', text: 'They are signed out now and cannot sign in again until access is restored.' },
    enable: { title: 'Restore access', label: 'Restore access', text: 'They can sign in again with their current access.' },
    'reset-authenticator': {
      title: 'Reset authenticator',
      label: 'Reset authenticator',
      text: 'For a lost phone. They are signed out and set up their authenticator again at their next sign-in.',
    },
  };

  return (
    <>
      <PageHeader title="Staff" description="Who can use this admin, what they can do, and where." />

      <Card className="mb-6 p-5">
        <h2 className="mb-4 font-medium">Give someone access</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Google email" hint="They must have signed in to Dezenmart once.">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Role">
            <Select value={form.preset} onChange={(e) => setForm({ ...form, preset: e.target.value })}>
              {Object.keys(data?.presets ?? PRESET_LABELS).map((p) => (
                <option key={p} value={p}>
                  {PRESET_LABELS[p] ?? humanize(p)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium">Services</legend>
          <div className="flex flex-wrap gap-4">
            {['*', ...(data?.services ?? ['food', 'express', 'shopping', 'platform'])].map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={form.services.includes(s)}
                  disabled={s !== '*' && form.services.includes('*')}
                  onChange={() => toggleService(s)}
                />
                {SERVICE_LABELS[s] ?? humanize(s)}
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
                <p className="font-medium">{typeof s.user === 'object' ? s.user.name || s.user.email : '—'}</p>
                <p className="text-xs text-muted">{emailOf(s)}</p>
              </>
            ),
          },
          {
            header: 'Can',
            cell: (s) => (
              <div className="flex flex-wrap gap-1">
                {s.capabilities.map((c) => (
                  <Badge key={c}>{CAPABILITY_LABELS[c] ?? humanize(c)}</Badge>
                ))}
              </div>
            ),
          },
          { header: 'Where', cell: (s) => s.services.map((x) => SERVICE_LABELS[x] ?? x).join(', ') },
          {
            header: 'Status',
            cell: (s) =>
              s.disabled ? (
                <Badge tone="bad">No access</Badge>
              ) : s.totpEnabled ? (
                <Badge tone="ok">Active</Badge>
              ) : (
                <Badge tone="warn">Not set up yet</Badge>
              ),
          },
          { header: 'Last sign-in', cell: (s) => <span className="text-xs text-muted">{formatDate(s.lastSignInAt)}</span> },
          {
            header: 'Actions',
            cell: (s) =>
              emailOf(s) === me ? (
                <span className="text-xs text-muted">You</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {s.disabled ? (
                    <Button onClick={() => setActing({ member: s, action: 'enable' })}>Restore access</Button>
                  ) : (
                    <Button variant="danger" onClick={() => setActing({ member: s, action: 'disable' })}>
                      Remove access
                    </Button>
                  )}
                  {s.totpEnabled && (
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
            {form.email} gets <strong>{PRESET_LABELS[form.preset] ?? form.preset}</strong> on{' '}
            {form.services.map((s) => SERVICE_LABELS[s] ?? s).join(', ')}. If they already have access, it is replaced and they
            are signed out.
          </>
        }
        actionLabel="Give access"
        onClose={() => setGranting(false)}
        onConfirm={async ({ code }) => {
          const res = await grant({ ...form, email: form.email.trim(), code });
          if ('error' in res) return errorMessage(res.error);
          setForm({ email: '', preset: 'support', services: [] });
          return null;
        }}
      />
      <ConfirmWithCode
        open={!!acting}
        title={acting ? actionText[acting.action].title : ''}
        summary={acting && <>{emailOf(acting.member)}. {actionText[acting.action].text}</>}
        actionLabel={acting ? actionText[acting.action].label : ''}
        danger={acting?.action === 'disable'}
        onClose={() => setActing(null)}
        onConfirm={async ({ code }) => {
          const res = await act({ id: acting!.member.id, action: acting!.action, code });
          return 'error' in res ? errorMessage(res.error) : null;
        }}
      />
    </>
  );
}
