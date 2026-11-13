import { useState } from 'react';
import { errorMessage, failureOf } from '../lib/errors';
import { useAppSelector } from '../store';
import { useClaimMutation, useReleaseMutation } from '../store/api';
import type { Claim, ClaimKind } from '../store/types';
import { StatusShape } from './brand';
import { ConfirmDialog } from './Dialog';
import { Button, ErrorNote } from './ui';

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });

/** The person handling a record, if it is someone other than me. Money actions lock for them. */
export function useClaimedByOther(claim?: Claim | null) {
  const me = useAppSelector((s) => s.session.access?.email);
  return claim && claim.by !== me ? claim : null;
}

/**
 * Who is handling this record. Taking it tells everyone else "I'm on it", and the backend refuses
 * their money actions until it is let go or taken over, so two people never pay the same thing.
 */
export function ClaimBar({ kind, id, claim, compact }: { kind: ClaimKind; id: string; claim?: Claim | null; compact?: boolean }) {
  const me = useAppSelector((s) => s.session.access?.email);
  const [take, taking] = useClaimMutation();
  const [release, releasing] = useReleaseMutation();
  const [confirmTakeOver, setConfirmTakeOver] = useState(false);
  const [error, setError] = useState('');
  const mine = !!claim && claim.by === me;
  const other = !!claim && !mine;

  const run = async (fn: () => Promise<{ error?: unknown }>) => {
    setError('');
    const res = await fn();
    if (res.error) setError(errorMessage(res.error as never));
  };

  const text = other ? (
    <>
      <span className="font-semibold">{claim!.name}</span> is on this since {time(claim!.since)}
    </>
  ) : mine ? (
    <>
      <span className="font-semibold">You</span> are handling this since {time(claim!.since)}
    </>
  ) : (
    <>Nobody is handling this yet</>
  );

  return (
    <div className={compact ? '' : 'space-y-2'}>
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-leaf-sm border px-4 py-3 text-[14px] ${other ? 'border-waiting/45 bg-waiting/[0.07]' : mine ? 'border-settled/40 bg-settled/[0.06]' : 'border-line bg-surface'}`}
      >
        <span className="flex items-center gap-2.5">
          <StatusShape shape={other ? 'petal' : mine ? 'circle' : 'ring'} tone={other ? 'waiting' : mine ? 'settled' : 'quiet'} size={9} />
          <span>{text}</span>
        </span>
        {other ? (
          <Button size="sm" variant="quiet" onClick={() => setConfirmTakeOver(true)}>
            Take over
          </Button>
        ) : mine ? (
          <Button size="sm" variant="quiet" busy={releasing.isLoading} onClick={() => run(() => release({ kind, id }))}>
            Let go
          </Button>
        ) : (
          <Button size="sm" busy={taking.isLoading} onClick={() => run(() => take({ kind, id }))}>
            Take this
          </Button>
        )}
      </div>
      <ErrorNote>{error}</ErrorNote>
      <ConfirmDialog
        open={confirmTakeOver}
        title="Take this over?"
        summary={claim ? `${claim.name} has been on this since ${time(claim.since)}. Talk to them first if you can; they will see that you took it over.` : ''}
        actionLabel="Take it over"
        onClose={() => setConfirmTakeOver(false)}
        onConfirm={async () => failureOf(await take({ kind, id, takeOver: true }))}
      />
    </div>
  );
}

/** A short tag for list rows: who is on it. */
export function ClaimTag({ claim }: { claim?: Claim | null }) {
  const me = useAppSelector((s) => s.session.access?.email);
  if (!claim) return null;
  const mine = claim.by === me;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] ${mine ? 'text-settled' : 'text-waiting'}`}>
      <StatusShape shape={mine ? 'circle' : 'petal'} tone={mine ? 'settled' : 'waiting'} size={7} />
      {mine ? 'You are on it' : `${claim.name.split(' ')[0]} is on it`}
    </span>
  );
}
