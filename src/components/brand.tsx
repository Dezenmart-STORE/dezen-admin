import type { CSSProperties } from 'react';
import type { Service } from '../store/types';

/**
 * The Dezenmart mark, and the two shapes it is made of, used as the admin's language:
 *   petal  = needs a person (its sharp corner points at what to do next)
 *   circle = settled
 *   ring   = on its way, nothing to do yet
 * Each of the four shapes stands for a service: Shopping (top-left petal), Express (top-right
 * circle), Foods (bottom-left circle), Platform (bottom-right petal).
 */

export const SERVICE_SLOT: Record<Service, 'tl' | 'tr' | 'bl' | 'br'> = {
  shopping: 'tl',
  express: 'tr',
  food: 'bl',
  platform: 'br',
};
export const SERVICE_NAME: Record<Service, string> = {
  shopping: 'Shopping',
  express: 'DezenExpress',
  food: 'DezenFoods',
  platform: 'People and money',
};

const RADIUS = {
  tl: '50% 50% 0 50%', // petal, sharp corner to the centre (bottom-right)
  tr: '50%',
  bl: '50%',
  br: '0 50% 50% 50%', // petal, sharp corner to the centre (top-left)
} as const;
const COLOUR = { tl: 'var(--need)', tr: 'var(--mark-white)', bl: 'var(--need)', br: 'var(--mark-white)' } as const;
const SMALL = { tl: false, tr: true, bl: true, br: false } as const;

type Slot = keyof typeof RADIUS;

/**
 * The mark. `lit` decides which shapes are filled (others are drawn as outlines), so Home can
 * show which services need someone. `arrive` plays the sign-in entrance.
 */
export function Mark({
  size = 64,
  lit,
  arrive,
  label = 'Dezenmart',
}: {
  size?: number;
  lit?: Partial<Record<Slot, boolean>>;
  arrive?: boolean;
  label?: string;
}) {
  const cell = size / 2;
  const gap = Math.max(1, Math.round(size * 0.045));
  const shapes: Slot[] = ['tl', 'tr', 'bl', 'br'];
  const from: Record<Slot, string> = {
    tl: 'translate(-45%, -45%)',
    tr: 'translate(45%, -45%)',
    bl: 'translate(-45%, 45%)',
    br: 'translate(45%, 45%)',
  };
  return (
    <span
      role="img"
      aria-label={label}
      className="inline-grid shrink-0"
      style={{ gridTemplateColumns: `repeat(2, ${cell - gap / 2}px)`, gridTemplateRows: `repeat(2, ${cell - gap / 2}px)`, gap }}
    >
      {shapes.map((s, i) => {
        const on = lit ? !!lit[s] : true;
        const small = SMALL[s];
        const style: CSSProperties = {
          display: 'block',
          borderRadius: RADIUS[s],
          background: on ? COLOUR[s] : 'transparent',
          boxShadow: on ? undefined : `inset 0 0 0 ${Math.max(1, size / 48)}px var(--line)`,
          width: small ? '76%' : '100%',
          height: small ? '76%' : '100%',
          justifySelf: s === 'tr' ? 'start' : s === 'bl' ? 'end' : undefined,
          alignSelf: s === 'tr' ? 'end' : s === 'bl' ? 'start' : undefined,
          transition: 'background-color 320ms var(--ease-settle), box-shadow 320ms var(--ease-settle)',
          ...(arrive ? ({ '--from': from[s], animation: `arrive 640ms ${i * 70}ms var(--ease-settle) both` } as CSSProperties) : {}),
        };
        return <span key={s} style={style} />;
      })}
    </span>
  );
}

/** The wordmark: wide caps like DEZENMART, with the admin's own word beside it. */
export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Mark size={compact ? 20 : 24} />
      <span className="font-display text-[13px] leading-none tracking-[0.12em]">
        Dezen<span className="text-ink-3"> admin</span>
      </span>
    </span>
  );
}

/** A tiny mark with only the service's own shape lit: says which service, without a label. */
export function ServiceGlyph({ service, size = 14, title }: { service: Service; size?: number; title?: boolean }) {
  return (
    <span className="inline-flex items-center" title={title ? SERVICE_NAME[service] : undefined}>
      <Mark size={size} lit={{ [SERVICE_SLOT[service]]: true }} label={SERVICE_NAME[service]} />
    </span>
  );
}

export type Shape = 'petal' | 'circle' | 'ring';

/** The status shape. Always shown with a word, so meaning never rests on colour alone. */
export function StatusShape({ shape, tone, size = 10 }: { shape: Shape; tone: 'need' | 'settled' | 'waiting' | 'quiet'; size?: number }) {
  const colour = { need: 'var(--need)', settled: 'var(--settled)', waiting: 'var(--waiting)', quiet: 'var(--ink-3)' }[tone];
  return (
    <span
      aria-hidden
      className="inline-block shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: shape === 'petal' ? '50% 50% 0 50%' : '50%',
        transform: shape === 'petal' ? 'rotate(-45deg)' : undefined,
        background: shape === 'ring' ? 'transparent' : colour,
        boxShadow: shape === 'ring' ? `inset 0 0 0 2px ${colour}` : undefined,
      }}
    />
  );
}

/** Loading: the four shapes light in turn around the centre. Replaces every spinner. */
export function Orbit({ size = 28, label = 'Loading' }: { size?: number; label?: string }) {
  const order: Slot[] = ['tl', 'tr', 'br', 'bl'];
  const cell = size / 2;
  return (
    <span role="status" aria-label={label} className="inline-grid" style={{ gridTemplateColumns: `repeat(2, ${cell - 1}px)`, gridTemplateRows: `repeat(2, ${cell - 1}px)`, gap: 2 }}>
      {(['tl', 'tr', 'bl', 'br'] as Slot[]).map((s) => (
        <span
          key={s}
          style={{
            display: 'block',
            borderRadius: RADIUS[s],
            background: COLOUR[s],
            width: SMALL[s] ? '76%' : '100%',
            height: SMALL[s] ? '76%' : '100%',
            justifySelf: s === 'tr' ? 'start' : s === 'bl' ? 'end' : undefined,
            alignSelf: s === 'tr' ? 'end' : s === 'bl' ? 'start' : undefined,
            animation: `orbit 1120ms ${order.indexOf(s) * 140}ms infinite`,
          }}
        />
      ))}
    </span>
  );
}

/** The signature: a petal closing into a circle, played once the server has confirmed. */
export function Settle({ size = 44 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block"
      style={{
        width: size,
        height: size,
        background: 'var(--settled)',
        transform: 'rotate(45deg)',
        borderRadius: '50%',
        animation: 'settle 520ms 120ms var(--ease-settle) backwards',
      }}
    />
  );
}
