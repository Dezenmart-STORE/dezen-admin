import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage, failureOf } from '../../lib/errors';
import { formatDate, formatNaira } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useCan } from '../../store';
import { useBookingQuery, useBookingsQuery, useRefundBookingMutation } from '../../store/api';
import type { Booking } from '../../store/types';
import { Table } from '../../components/Table';
import { PersonLink } from '../../components/PersonLink';
import { ListToolbar } from '../../components/ListToolbar';
import { RecordPage } from '../../components/RecordPage';
import { ConfirmWithCode } from '../../components/Dialog';
import { Badge, Button, KeyValues, PageHeader, Pagination, StatusBadge } from '../../components/ui';

const needsRefund = (b: Booking) => b.status === 'cancelled' && b.paymentStatus === 'paid';
const paymentBadge = (b: Booking) =>
  needsRefund(b) ? <Badge tone="bad">Paid, not refunded</Badge> : <StatusBadge status={b.paymentStatus} />;

export function Bookings() {
  const list = useListParams();
  const { data, isLoading, isFetching, error } = useBookingsQuery(list.args);
  return (
    <>
      <PageHeader title="Trips" description="Rides and deliveries booked on DezenExpress." />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Search by trip, customer or rider"
        statuses={[
          { value: '', label: 'All trips' },
          { value: 'to_refund', label: 'Cancelled and paid: refund due' },
          { value: 'pending', label: 'Waiting for a rider' },
          { value: 'in_transit', label: 'On the way' },
          { value: 'completed', label: 'Completed' },
          { value: 'cancelled', label: 'Cancelled' },
        ]}
        onChange={list.set}
      />
      <Table
        rows={data?.items}
        loading={isLoading}
        error={errorMessage(error)}
        rowKey={(b) => b.id}
        empty="No trips match."
        columns={[
          {
            header: 'Trip',
            cell: (b) => (
              <Link to={`/express/bookings/${b.id}`} className="font-mono text-sm text-info hover:underline">
                {b.bookingRef}
              </Link>
            ),
          },
          { header: 'Kind', cell: (b) => (b.type === 'ride' ? 'Ride' : 'Delivery') },
          { header: 'Route', cell: (b) => <span className="text-sm">{b.pickup} → {b.dropoff}</span> },
          { header: 'Customer', cell: (b) => b.customer.name },
          { header: 'Rider', cell: (b) => b.rider?.name ?? <span className="text-muted">—</span> },
          { header: 'Fare', cell: (b) => formatNaira(b.fare), className: 'whitespace-nowrap text-right' },
          { header: 'Status', cell: (b) => <StatusBadge status={b.status} /> },
          { header: 'Payment', cell: paymentBadge },
          { header: 'Booked', cell: (b) => <span className="whitespace-nowrap text-xs text-muted">{formatDate(b.createdAt)}</span> },
        ]}
      />
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}
    </>
  );
}

export function BookingDetail() {
  const { id = '' } = useParams();
  const can = useCan();
  const { data: b, isLoading, error } = useBookingQuery(id);
  const [refund] = useRefundBookingMutation();
  const [open, setOpen] = useState(false);
  return (
    <RecordPage
      back="/express/bookings"
      backLabel="Trips"
      loading={isLoading}
      error={errorMessage(error)}
      title={<span className="font-mono">{b?.bookingRef}</span>}
      badge={b && <StatusBadge status={b.status} />}
      actions={b && needsRefund(b) && can('move_money', 'express') && <Button variant="primary" onClick={() => setOpen(true)}>Refund customer {formatNaira(b.fare)}</Button>}
      timeline={b?.timeline}
      details={
        b && (
          <KeyValues
            rows={[
              ['Kind', b.type === 'ride' ? 'Ride' : 'Delivery'],
              ['From', b.pickup],
              ['To', b.dropoff],
              ['Distance', `${b.distanceKm} km`],
              ['Customer', <PersonLink id={b.customer.id} name={b.customer.name} />],
              ['Rider', b.rider?.name ?? '—'],
              ['Fare', formatNaira(b.fare)],
              ['Payment', paymentBadge(b)],
              ['Booked', formatDate(b.createdAt)],
            ]}
          />
        )
      }
    >
      {b && (
        <ConfirmWithCode
          open={open}
          title="Refund the customer"
          summary={`${b.customer.name} paid ${formatNaira(b.fare)} for a trip that was cancelled. The full fare goes back to them by bank transfer.`}
          amount={b.fare}
          askReason
          actionLabel={`Refund ${formatNaira(b.fare)}`}
          onClose={() => setOpen(false)}
          onConfirm={async ({ code, reason }) => failureOf(await refund({ id: b.id, amount: b.fare, code, reason }))}
        />
      )}
    </RecordPage>
  );
}
