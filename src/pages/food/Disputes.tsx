import { errorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useFoodDisputesQuery } from '../../store/api';
import { Table } from '../../components/Table';
import { Money, PageHeader, Pagination, Status } from '../../components/ui';

/** Open food disputes, oldest first. Each opens as a case file with the ruling at the end. */
export function FoodDisputes() {
  const list = useListParams();
  const { data, isLoading, isFetching, error } = useFoodDisputesQuery(list.args);
  return (
    <>
      <PageHeader service="food" eyebrow="DezenFoods" title="Disputes" description="Buyers waiting for a ruling. Open one to read both sides before deciding." />
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
          title: <span className="font-mono">{o.orderRef}</span>,
          subtitle: `“${o.dispute?.reason}”`,
          amount: <Money amount={o.total} />,
          status: <Status status="disputed" word="Needs a ruling" />,
        })}
        columns={[
          { header: 'Order', cell: (o) => <span className="font-mono">{o.orderRef}</span> },
          { header: 'What the buyer said', cell: (o) => <span className="block max-w-[38ch]">“{o.dispute?.reason}”</span> },
          { header: 'Vendor', cell: (o) => o.vendor.name },
          { header: 'Buyer', cell: (o) => o.buyer.name },
          { header: 'At stake', align: 'right', cell: (o) => <Money amount={o.total} /> },
          { header: 'Opened', cell: (o) => <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{formatDate(o.dispute?.openedAt)}</span> },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}
