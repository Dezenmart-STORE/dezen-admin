import { useEffect, useMemo, useState } from 'react';
import { errorMessage, failureOf } from '../lib/errors';
import { formatDate, formatNaira } from '../lib/format';
import { useCan } from '../store';
import { useSettingsQuery, useUpdateSettingsMutation } from '../store/api';
import type { Settings as SettingsShape } from '../store/types';
import { ConfirmWithCode } from '../components/Dialog';
import { Button, Card, ErrorNote, Field, Input, Loading, PageHeader, SectionTitle } from '../components/ui';

type Form = Record<string, string>;
const FIELDS: { key: string; label: string; hint: string; unit: '%' | '₦' | '×'; group: string }[] = [
  { key: 'approvalThreshold', label: 'Second approval above', hint: 'Payments larger than this need a second person to approve', unit: '₦', group: 'Approvals' },
  { key: 'foodCommissionPercent', label: 'Vendor commission', hint: 'Taken from what each vendor earns on an order', unit: '%', group: 'DezenFoods' },
  { key: 'foodServiceFeePercent', label: 'Buyer service fee', hint: 'Added to the buyer’s bill', unit: '%', group: 'DezenFoods' },
  { key: 'expressPlatformFeePercent', label: 'Platform fee', hint: 'Taken from the fare before the rider is paid', unit: '%', group: 'DezenExpress' },
  { key: 'expressFare.baseFare', label: 'Base fare', hint: 'Every trip starts here', unit: '₦', group: 'Lowest fare a trip may be booked at' },
  { key: 'expressFare.perKm', label: 'Per km', hint: 'Added for each kilometre', unit: '₦', group: 'Lowest fare a trip may be booked at' },
  { key: 'expressFare.minFare', label: 'Minimum fare', hint: 'No trip is cheaper than this', unit: '₦', group: 'Lowest fare a trip may be booked at' },
  { key: 'expressFare.premiumMultiplier', label: 'Premium rides', hint: 'Premium fares are multiplied by this', unit: '×', group: 'Lowest fare a trip may be booked at' },
  { key: 'expressFare.mediumParcelSurcharge', label: 'Medium parcel', hint: 'Added for a medium parcel', unit: '₦', group: 'Lowest fare a trip may be booked at' },
  { key: 'expressFare.largeParcelSurcharge', label: 'Large parcel', hint: 'Added for a large parcel', unit: '₦', group: 'Lowest fare a trip may be booked at' },
];

const read = (s: SettingsShape, key: string) => String(key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], s));

export function Settings() {
  const can = useCan();
  const { data, isLoading, error } = useSettingsQuery();
  const [save] = useUpdateSettingsMutation();
  const [form, setForm] = useState<Form>({});
  const [confirming, setConfirming] = useState(false);
  const mayEdit = can('staff_admin', 'platform');

  useEffect(() => {
    if (data) setForm(Object.fromEntries(FIELDS.map((f) => [f.key, read(data, f.key)])));
  }, [data]);

  const changed = useMemo(() => (data ? FIELDS.filter((f) => form[f.key] !== read(data, f.key)) : []), [data, form]);
  const invalid = FIELDS.some((f) => form[f.key] === '' || Number.isNaN(Number(form[f.key])) || Number(form[f.key]) < 0 || (f.unit === '%' && Number(form[f.key]) > 100));

  const changes = (): Partial<SettingsShape> => {
    const out: Record<string, unknown> = {};
    for (const f of changed) {
      const [a, b] = f.key.split('.');
      if (b) out[a] = { ...(out[a] as object) ?? {}, ...(data as unknown as Record<string, object>)[a], [b]: Number(form[f.key]) };
      else out[a] = Number(form[f.key]);
    }
    return out as Partial<SettingsShape>;
  };
  const show = (f: (typeof FIELDS)[number], v: string) => (f.unit === '₦' ? formatNaira(Number(v)) : f.unit === '%' ? `${v}%` : `×${v}`);

  if (isLoading) return <Loading />;
  if (error) return <ErrorNote>{errorMessage(error)}</ErrorNote>;

  const groups = [...new Set(FIELDS.map((f) => f.group))];
  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Fees and fares"
        description={data ? `Last changed ${formatDate(data.updatedAt)} by ${data.updatedBy}.` : undefined}
        actions={mayEdit && <Button variant="primary" disabled={!changed.length || invalid} onClick={() => setConfirming(true)}>Save changes</Button>}
      />
      <div className="space-y-6">
        {groups.map((g) => (
          <Card key={g} className="p-5">
            <SectionTitle>{g}</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.filter((f) => f.group === g).map((f) => (
                <Field key={f.key} label={`${f.label} (${f.unit})`} hint={f.hint}>
                  <Input
                    inputMode="decimal"
                    value={form[f.key] ?? ''}
                    disabled={!mayEdit}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value.trim() })}
                  />
                </Field>
              ))}
            </div>
          </Card>
        ))}
      </div>
      {data && (
        <ConfirmWithCode
          open={confirming}
          title="Change fees and fares"
          summary={
            <>
              <p className="mb-2">These take effect for new orders and trips straight away:</p>
              <ul className="space-y-1">
                {changed.map((f) => (
                  <li key={f.key}>
                    {f.label}: {show(f, read(data, f.key))} → <strong className="text-ink">{show(f, form[f.key])}</strong>
                  </li>
                ))}
              </ul>
            </>
          }
          askReason
          actionLabel="Save changes"
          onClose={() => setConfirming(false)}
          onConfirm={async ({ code, reason }) => failureOf(await save({ changes: changes(), code, reason }))}
        />
      )}
    </>
  );
}
