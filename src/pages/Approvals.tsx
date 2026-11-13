import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage, failureOf, receiptOf } from '../lib/errors';
import { formatDate } from '../lib/format';
import { useListParams } from '../lib/useListParams';
import { useAppSelector } from '../store';
import { useApprovalsQuery, useApproveMutation, useDeclineMutation, useSettingsQuery } from '../store/api';
import type { Approval } from '../store/types';
import { ServiceGlyph, StatusShape } from '../components/brand';
import { ConfirmDialog, MoneySheet } from '../components/Dialog';
import { Button, Card, Empty, ErrorNote, Loading, Money, PageHeader, Pagination, Segments, Status } from '../components/ui';

/**
 * The second approver. A money action above the threshold waits here; a different person approves
 * it through the same money ritual, or declines it with a reason. Nobody approves their own.
 */
export function Approvals() {
  const me = useAppSelector((s) => s.session.access?.email);
  const list = useListParams({ status: 'pending' });
  const { data, isLoading, isFetching, error } = useApprovalsQuery(list.args);
  const { data: settings } = useSettingsQuery();
  const [approve] = useApproveMutation();
  const [decline] = useDeclineMutation();
  const [approving, setApproving] = useState<Approval | null>(null);
  const [declining, setDeclining] = useState<Approval | null>(null);

  return (
    <>
      <PageHeader
        title="Approvals"
        description={`Payments above ${settings ? `₦${settings.approvalThreshold.toLocaleString('en-NG')}` : 'the limit'} need a second person. Read what was asked and why, then approve or decline.`}
      />
      <div className="mb-5">
        <Segments
          label="Show"
          value={list.status}
          onChange={(v) => list.set({ status: v })}
          options={[
            { value: 'pending', label: 'Waiting' },
            { value: 'approved', label: 'Approved' },
            { value: 'declined', label: 'Declined' },
          ]}
        />
      </div>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorNote>{errorMessage(error)}</ErrorNote>
      ) : !data?.items.length ? (
        <Card>
          <Empty settled={list.status === 'pending'}>{list.status === 'pending' ? 'Nothing is waiting for approval.' : 'Nothing here yet.'}</Empty>
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.items.map((a) => {
            const mine = a.requestedBy === me;
            return (
              <li key={a.id}>
                <Card className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
                        <ServiceGlyph service={a.service} size={14} />
                        Asked {formatDate(a.requestedAt)}
                      </p>
                      <p className="text-[17px] font-semibold">{a.summary}</p>
                      <p className="mt-1 text-[14px] text-ink-2">
                        {mine ? 'You asked' : `${a.requestedBy} asked`}: “{a.reason}”
                      </p>
                      <Link to={a.link} className="mt-2 inline-block text-[13px] font-semibold underline-offset-4 hover:underline">
                        Open the record →
                      </Link>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <span className="text-[24px]">
                        <Money amount={a.amount} currency={a.currency} />
                      </span>
                      {a.status === 'pending' ? (
                        mine ? (
                          <span className="flex items-center gap-2 text-[13px] text-waiting">
                            <StatusShape shape="ring" tone="waiting" size={9} />
                            Waiting for someone else
                          </span>
                        ) : (
                          <span className="flex gap-2">
                            <Button size="sm" variant="quiet" onClick={() => setDeclining(a)}>
                              Decline
                            </Button>
                            <Button size="sm" variant="primary" onClick={() => setApproving(a)}>
                              Approve
                            </Button>
                          </span>
                        )
                      ) : (
                        <span className="flex flex-col items-end gap-0.5">
                          <Status status={a.status === 'approved' ? 'done' : 'cancelled'} word={a.status === 'approved' ? 'Approved' : 'Declined'} />
                          <span className="text-[12px] text-ink-3">
                            by {a.decidedBy} · {formatDate(a.decidedAt)}
                          </span>
                          {a.declineReason && <span className="max-w-[30ch] text-right text-[12px] text-ink-3">“{a.declineReason}”</span>}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {data && <Pagination page={data.page} total={data.total} limit={data.limit} busy={isFetching} onChange={(page) => list.set({ page })} />}

      {approving && (
        <MoneySheet
          open={!!approving}
          eyebrow={`Second approval · asked by ${approving.requestedBy}`}
          title="Approve this payment"
          amount={approving.amount}
          currency={approving.currency}
          recipient={{ name: approving.recipient }}
          consequence={
            <>
              {approving.summary}. They said: “{approving.reason}”. Approving sends it now.
            </>
          }
          actionLabel={`Approve ₦${approving.amount.toLocaleString('en-NG')}`}
          onClose={() => setApproving(null)}
          onConfirm={async ({ code }) => receiptOf(await approve({ id: approving.id, amount: approving.amount, code }))}
        />
      )}
      <ConfirmDialog
        open={!!declining}
        title="Decline this payment"
        summary={declining ? `${declining.summary}. Nothing is sent, and ${declining.requestedBy} sees your reason.` : ''}
        actionLabel="Decline"
        askReason
        reasonHint={declining ? `${declining.requestedBy} sees this.` : undefined}
        danger
        onClose={() => setDeclining(null)}
        onConfirm={async (reason) => failureOf(await decline({ id: declining!.id, reason: reason ?? '' }))}
      />
    </>
  );
}
