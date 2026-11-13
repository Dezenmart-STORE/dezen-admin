import { useState } from 'react';
import { errorMessage } from '../lib/errors';
import { formatDate } from '../lib/format';
import { useUserQuery, useUsersQuery } from '../store/api';
import { Table } from '../components/Table';
import { Dialog } from '../components/Dialog';
import { Button, ErrorNote, InfoNote, Loading, PageHeader } from '../components/ui';

/** Full user records, bank details included: every list and view is logged with your name. */
export function Users() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, error } = useUsersQuery(page);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Users" description="Customer accounts across Shopping, DezenFoods and DezenExpress." />
      <div className="mb-4">
        <InfoNote>These records include phone numbers and bank details. Each time you open this page or a person, it is logged with your name.</InfoNote>
      </div>
      <Table
        rows={data}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(u) => u._id}
        empty="No users on this page."
        columns={[
          {
            header: 'Person',
            cell: (u) => (
              <>
                <p className="font-medium">{u.name ?? '—'}</p>
                <p className="text-xs text-muted">{u.email}</p>
              </>
            ),
          },
          { header: 'Seller', cell: (u) => (u.isMerchant ? 'Yes' : 'No') },
          { header: 'Joined', cell: (u) => <span className="text-xs text-muted">{formatDate(u.createdAt)}</span> },
          { header: '', cell: (u) => <Button onClick={() => setOpenId(u._id)}>View details</Button> },
        ]}
      />
      <div className="mt-4 flex items-center justify-end gap-3 text-sm text-muted">
        <Button disabled={page <= 1 || isFetching} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        Page {page}
        <Button disabled={(data?.length ?? 0) < 25 || isFetching} onClick={() => setPage(page + 1)}>
          Next
        </Button>
      </div>
      <UserDetails id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function UserDetails({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useUserQuery(id ?? '', { skip: !id });
  const rows: [string, string | undefined][] = data
    ? [
        ['Name', data.name],
        ['Email', data.email],
        ['Phone', data.phoneNumber],
        ['Address', data.address],
        ['Bank', data.bankName],
        ['Account number', data.bankAccount],
        ['Joined', formatDate(data.createdAt)],
      ]
    : [];
  return (
    <Dialog open={!!id} title="User details" onClose={onClose}>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorNote>{errorMessage(error)}</ErrorNote>
      ) : (
        <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="break-words">{v || '—'}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-6 flex justify-end">
        <Button onClick={onClose}>Close</Button>
      </div>
    </Dialog>
  );
}
