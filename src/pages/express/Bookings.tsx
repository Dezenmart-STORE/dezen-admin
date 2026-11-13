import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { errorMessage, receiptOf } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { useCan } from '../../store';
import { useBookingQuery, useBookingsQuery, useRefundBookingMutation } from '../../store/api';
import type { Booking } from '../../store/types';
import { Table } from '../../components/Table';
import { ListToolbar } from '../../components/ListToolbar';
import { RecordPage } from '../../components/RecordPage';
import { MoneySheet } from '../../components/Dialog';
import { PersonLink } from '../../components/PersonLink';
import { WHO } from '../../components/Choice';
import { Button, KeyValues, Locked, Money, PageHeader, Pagination, Status } from '../../components/ui';

const needsRefund = (b: Booking) => b.status === 'cancelled' && b.paymentStatus === 'paid';
const payment = (b: Booking) => (needsRefund(b) ? <Status status="to_refund" word="Paid · refund due" /> : <Status status={b.paymentStatus} />);

export function Bookings() {
  const list = useListParams();
  const { data, isLoading, isFetching, error } = useBookingsQuery(list.args);
  return (
    <>
      <PageHeader service="express" eyebrow="DezenExpress" title="Trips" description="Rides and deliveries. Open one for its history and to refund it." />
      <ListToolbar
        q={list.q}
        status={list.status}
        placeholder="Trip, customer or rider"
        statuses={[
          { value: '', label: 'All' },
          { value: 'to_refund', label: 'Refund due' },
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
        fetching={isFetching}
        error={errorMessage(error)}
        rowKey={(b) => b.id}
        href={(b) => `/express/bookings/${b.id}`}
        empty={list.status === 'to_refund' ? 'Every cancelled trip has been refunded.' : 'No trips match.'}
        settledWhenEmpty={list.status === 'to_refund'}
        mobile={(b) => ({
          title: <span className="font-mono">{b.bookingRef}</span>,
          subtitle: `${b.pickup} → ${b.dropoff}`,
          amount: <Money amount={b.fare} />,
          status: needsRefund(b) ? payment(b) : <Status status={b.status} />,
        })}
        columns={[
          { header: 'Trip', cell: (b) => <span className="font-mono">{b.bookingRef}</span> },
          { header: 'Route', cell: (b) => <span className="block max-w-[30ch] text-ink-2">{b.pickup} → {b.dropoff}</span> },
          { header: 'Customer', cell: (b) => b.customer.name },
          { header: 'Rider', cell: (b) => b.rider?.name ?? <span className="text-ink-3">—</span> },
          { header: 'Fare', align: 'right', cell: (b) => <Money amount={b.fare} /> },
          { header: 'Trip status', cell: (b) => <Status status={b.status} /> },
          { header: 'Payment', cell: payment },
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
  const action =
    b && needsRefund(b) ? (
      can('move_money', 'express') ? (
        <Button variant="primary" onClick={() => setOpen(true)}>
          Refund {b.customer.name.split(' ')[0]}
        </Button>
      ) : (
        <Locked who={WHO.move_money}>Refund {b.customer.name.split(' ')[0]}</Locked>
      )
    ) : undefined;
  return (
    <RecordPage
      back="/express/bookings"
      backLabel="Trips"
      service="express"
      kind={b ? (b.type === 'ride' ? 'Ride' : 'Delivery') : undefined}
      loading={isLoading}
      error={errorMessage(error)}
      title={<span className="font-mono">{b?.bookingRef}</span>}
      badge={b && <Status status={b.status} />}
      actions={action}
      timeline={b?.timeline}
      details={
        b && (
          <>
            <p className="mb-5 text-[17px] leading-snug">
              {b.pickup} <span className="text-ink-3">→</span> {b.dropoff}
              <span className="ml-2 font-mono text-[13px] text-ink-3">{b.distanceKm} km</span>
            </p>
            <KeyValues
              rows={[
                ['Customer', <PersonLink id={b.customer.id} name={b.customer.name} />],
                ['Rider', b.rider?.name ?? '—'],
                ['Fare', <Money amount={b.fare} />],
                ['Payment', payment(b)],
                ['Booked', formatDate(b.createdAt)],
              ]}
            />
          </>
        )
      }
    >
      {b && (
        <MoneySheet
          open={open}
          eyebrow={`${b.bookingRef} · cancelled`}
          title="Refund the customer"
          amount={b.fare}
          recipient={{ name: b.customer.name, detail: 'Back to the account they paid from' }}
          consequence={`${b.customer.name} paid for a trip that did not happen. The full fare goes back to them by bank transfer.`}
          actionLabel={`Refund ₦${b.fare.toLocaleString('en-NG')} to ${b.customer.name.split(' ')[0]}`}
          onClose={() => setOpen(false)}
          onConfirm={async ({ code, reason }) => receiptOf(await refund({ id: b.id, amount: b.fare, code, reason }))}
        />
      )}
    </RecordPage>
  );
}
