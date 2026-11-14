import { errorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useVendorsQuery } from '../../store/api';
import { Table } from '../../components/Table';
import { ListToolbar } from '../../components/ListToolbar';
import { QueueTop, Waited } from '../../components/NextCard';
import { PageHeader, Pagination, Status } from '../../components/ui';

export function Vendors() {
  const list = useListParams({ status: 'pending' });
  const { data, isLoading, isFetching, error } = useVendorsQuery(list.args);

  return (
    <>
      {list.status === 'pending' ? (
        <QueueTop
          queue="vendors"
          service="food"
          eyebrow="DezenFoods"
          title="Vendors"
          who={['kitchen', 'kitchens']}
          waitFor="to start selling"
          description="Open a kitchen to see its photos and ID beside what the owner typed."
          clear={['No kitchens are waiting for review.', 'Every kitchen that applied can sell or has been told what to fix.']}
        />
      ) : (
        <PageHeader service="food" eyebrow="DezenFoods" title="Vendors" description="Kitchens that sell on DezenFoods." />
      )}
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Kitchen or owner"
        statuses={[
          { value: 'pending', label: 'To review' },
          { value: 'approved', label: 'Approved' },
          { value: 'suspended', label: 'Suspended' },
          { value: 'rejected', label: 'Rejected' },
          { value: '', label: 'All' },
        ]}
        onChange={list.set}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={errorMessage(error)}
        rowKey={(v) => v.id}
        href={(v) => `/food/vendors/${v.id}`}
        empty={list.status === 'pending' ? 'No kitchens are waiting for review.' : 'No vendors match.'}
        settledWhenEmpty={list.status === 'pending'}
        mobile={(v) => ({
          title: v.businessName,
          subtitle: `${v.ownerName} · ${v.lga}, ${v.state}`,
          amount: v.status === 'pending' ? <Waited since={v.createdAt} promiseHours={48} /> : null,
          status: <Status status={v.status} />,
        })}
        columns={[
          {
            header: 'Kitchen',
            cell: (v) => (
              <>
                <p className="font-semibold">{v.businessName}</p>
                <p className="text-[12.5px] text-ink-3">
                  {v.ownerName} · {v.ownerEmail}
                </p>
              </>
            ),
          },
          { header: 'Where', cell: (v) => <span className="block max-w-[26ch] text-ink-2">{v.address}</span> },
          {
            header: 'Pays out to',
            cell: (v) => (
              <span className="text-[12.5px]">
                {v.payoutAccount.accountName}
                <br />
                <span className="font-mono text-ink-3">
                  {v.payoutAccount.bankName} {v.payoutAccount.accountNumberMasked}
                </span>
              </span>
            ),
          },
          {
            header: 'Status',
            cell: (v) => (
              <>
                <Status status={v.status} />
                {v.rejectionReason && <p className="mt-1 max-w-[24ch] text-[12px] text-ink-3">{v.rejectionReason}</p>}
              </>
            ),
          },
          { header: 'Orders', align: 'right', cell: (v) => <span className="font-mono">{v.ordersCompleted}</span> },
          list.status === 'pending'
            ? { header: 'Waiting', align: 'right', cell: (v) => <Waited since={v.createdAt} promiseHours={48} /> }
            : { header: 'Applied', cell: (v) => <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(v.createdAt)}</span> },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}
