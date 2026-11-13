import { Link } from 'react-router-dom';
import { useCan } from '../store';
import { useFoodDisputesQuery, useFoodOrdersQuery, useRidersQuery, useVendorsQuery } from '../store/api';
import { Card, PageHeader, Spinner } from '../components/ui';

/** What needs someone, as counts. Only the queues the person's access covers are shown. */
function Queue({ label, count, loading, to }: { label: string; count?: number; loading: boolean; to: string }) {
  return (
    <Link to={to} className="block">
      <Card className="p-5 hover:border-muted">
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-2 text-3xl font-semibold">{loading ? <Spinner small /> : (count ?? '—')}</p>
      </Card>
    </Link>
  );
}

export function Home() {
  const can = useCan();
  const food = can('support', 'food');
  const express = can('support', 'express');
  const vendors = useVendorsQuery('pending', { skip: !food });
  const disputes = useFoodDisputesQuery(undefined, { skip: !food });
  const failed = useFoodOrdersQuery(undefined, { skip: !food });
  const riders = useRidersQuery({ status: 'pending', page: 1 }, { skip: !express });

  const moneyStuck = failed.data?.filter((o) => o.payout?.status === 'failed' || o.refund?.status === 'failed').length;

  return (
    <>
      <PageHeader title="Home" description="What is waiting for someone." />
      {!food && !express ? (
        <p className="text-sm text-muted">Your access has no queues. Use the menu to find what you can see.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {food && <Queue label="Vendors waiting for review" count={vendors.data?.length} loading={vendors.isLoading} to="/food?tab=vendors" />}
          {food && <Queue label="Open food disputes" count={disputes.data?.length} loading={disputes.isLoading} to="/food?tab=disputes" />}
          {food && <Queue label="Payments that failed" count={moneyStuck} loading={failed.isLoading} to="/food?tab=orders" />}
          {express && <Queue label="Riders waiting for review" count={riders.data?.total} loading={riders.isLoading} to="/express" />}
        </div>
      )}
    </>
  );
}
