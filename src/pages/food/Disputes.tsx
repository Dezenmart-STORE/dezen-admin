import { Link } from 'react-router-dom';
import { errorMessage } from '../../lib/errors';
import { formatDate, formatNaira } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useFoodDisputesQuery } from '../../store/api';
import { Table } from '../../components/Table';
import { PageHeader, Pagination } from '../../components/ui';

/** Open food disputes, oldest first. The ruling is made on the order's page, with its history. */
export function FoodDisputes() {
  const list = useListParams();
  const { data, isLoading, isFetching, error } = useFoodDisputesQuery(list.args);
  return (
    <>
      <PageHeader title="Food disputes" description="Orders a buyer has complained about. Open one to read its history and make a ruling." />
      <Table
        rows={data?.items}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(o) => o.id}
        empty="No open disputes."
        columns={[
          {
            header: 'Order',
            cell: (o) => (
              <Link to={`/food/orders/${o.id}`} className="font-mono text-sm text-info hover:underline">
                {o.orderRef}
              </Link>
            ),
          },
          { header: 'What the buyer said', cell: (o) => <span className="text-sm">“{o.dispute?.reason}”</span> },
          { header: 'Vendor', cell: (o) => o.vendor.name },
          { header: 'Buyer', cell: (o) => o.buyer.name },
          { header: 'At stake', cell: (o) => formatNaira(o.total), className: 'whitespace-nowrap text-right' },
          { header: 'Opened', cell: (o) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(o.dispute?.openedAt)}</span> },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}
