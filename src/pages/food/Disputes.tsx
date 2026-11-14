import { errorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useFoodDisputesQuery } from '../../store/api';
import { Table } from '../../components/Table';
import { Money, Pagination } from '../../components/ui';
import { ClaimTag } from '../../components/ClaimBar';
import { QueueTop, Waited } from '../../components/NextCard';

/** Open food disputes, oldest first. Each opens as a case file with the ruling at the end. */
export function FoodDisputes() {
  const list = useListParams();
  const { data, isLoading, isFetching, error } = useFoodDisputesQuery(list.args);
  return (
    <>
      <QueueTop
        queue="food-disputes"
        service="food"
        eyebrow="DezenFoods"
        title="Disputes"
        who={['buyer', 'buyers']}
        waitFor="for a ruling"
        description="Open one to read both sides before deciding. The oldest is at the top."
        clear={['Every food dispute has a ruling.', 'Nobody is waiting to hear back from us.']}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={errorMessage(error)}
        rowKey={(o) => o.id}
        href={(o) => `/food/orders/${o.id}`}
        empty="Every food dispute has a ruling."
        settledWhenEmpty
        mobile={(o) => ({
          title: o.buyer.name,
          subtitle: `“${o.dispute?.reason}”`,
          amount: <Money amount={o.total} />,
          status: <Waited since={o.dispute?.openedAt} promiseHours={48} />,
        })}
        columns={[
          {
            header: 'Buyer',
            cell: (o) => (
              <>
                <span className="block">{o.buyer.name}</span>
                <span className="font-mono text-[12px] font-normal text-ink-3">{o.orderRef} · {formatDate(o.dispute?.openedAt)}</span>
              </>
            ),
          },
          { header: 'What they said', cell: (o) => <span className="block max-w-[38ch]">“{o.dispute?.reason}”</span> },
          { header: 'Vendor', cell: (o) => o.vendor.name },
          { header: 'At stake', align: 'right', cell: (o) => <Money amount={o.total} /> },
          { header: 'Waiting', align: 'right', cell: (o) => <Waited since={o.dispute?.openedAt} promiseHours={48} /> },
          { header: 'Who has it', cell: (o) => <ClaimTag claim={o.claim} /> },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}
