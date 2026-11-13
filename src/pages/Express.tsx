import { useState } from 'react';
import { errorMessage } from '../lib/errors';
import { humanize } from '../lib/format';
import { useCan } from '../store';
import { useRidersQuery, useVerifyRiderMutation, type Rider } from '../store/api';
import { Table } from '../components/Table';
import { Dialog } from '../components/Dialog';
import { Button, ErrorNote, PageHeader, StatusBadge, Tabs } from '../components/ui';

type Status = 'pending' | 'verified' | 'rejected';

export function Express() {
  const can = useCan();
  const [status, setStatus] = useState<Status>('pending');
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, error } = useRidersQuery({ status, page });
  const [acting, setActing] = useState<{ rider: Rider; to: 'verified' | 'rejected' } | null>(null);
  const mayVerify = can('verify', 'express');
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <PageHeader title="DezenExpress" description="Riders who applied to deliver and drive." />
      <Tabs
        label="Rider status"
        value={status}
        onChange={(s) => {
          setStatus(s);
          setPage(1);
        }}
        options={[
          { value: 'pending', label: 'Waiting for review' },
          { value: 'verified', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
        ]}
      />
      <Table
        rows={data?.riders}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(r) => String(r.id)}
        empty="No riders here."
        columns={[
          {
            header: 'Rider',
            cell: (r) => (
              <>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted">
                  {r.email} · {r.phone}
                </p>
              </>
            ),
          },
          {
            header: 'Vehicle',
            cell: (r) => (
              <span className="text-xs">
                {humanize(r.vehicleType)} · {r.vehiclePlateNumber ?? '—'}
                <br />
                <span className="text-muted">Licence {r.driverLicenseNumber ?? '—'}</span>
              </span>
            ),
          },
          {
            header: 'Paid to',
            cell: (r) =>
              r.payoutAccount ? (
                <span className="text-xs">
                  {r.payoutAccount.bankName} · {r.payoutAccount.accountNumberMasked}
                </span>
              ) : (
                <span className="text-xs text-muted">No checked account</span>
              ),
          },
          { header: 'Status', cell: (r) => <StatusBadge status={r.verificationStatus} /> },
          {
            header: 'Actions',
            cell: (r) =>
              mayVerify ? (
                <div className="flex flex-wrap gap-2">
                  {r.verificationStatus !== 'verified' && (
                    <Button onClick={() => setActing({ rider: r, to: 'verified' })}>Approve</Button>
                  )}
                  {r.verificationStatus !== 'rejected' && (
                    <Button variant="danger" onClick={() => setActing({ rider: r, to: 'rejected' })}>
                      Reject
                    </Button>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted">View only</span>
              ),
          },
        ]}
      />
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-3 text-sm text-muted">
          <Button disabled={page <= 1 || isFetching} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          Page {page} of {pages}
          <Button disabled={page >= pages || isFetching} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
      <VerifyRider acting={acting} onClose={() => setActing(null)} />
    </>
  );
}

function VerifyRider({ acting, onClose }: { acting: { rider: Rider; to: 'verified' | 'rejected' } | null; onClose: () => void }) {
  const [verify, { isLoading }] = useVerifyRiderMutation();
  const [error, setError] = useState('');
  const approve = acting?.to === 'verified';
  const submit = async () => {
    if (!acting) return;
    const res = await verify({ riderId: String(acting.rider.id), status: acting.to });
    if ('error' in res) return setError(errorMessage(res.error));
    setError('');
    onClose();
  };
  return (
    <Dialog open={!!acting} title={`${approve ? 'Approve' : 'Reject'} ${acting?.rider.name ?? ''}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {approve
            ? 'They can go online and take rides and deliveries. Check their licence and plate number first.'
            : 'They cannot go online. They can contact support to apply again.'}
        </p>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={approve ? 'primary' : 'danger'} busy={isLoading} onClick={submit}>
            {approve ? 'Approve' : 'Reject'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
