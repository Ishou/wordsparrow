import type { CSSProperties } from 'react';
import { css } from 'styled-system/css';

// WordSparrow brand lockup (ADR-0072 identity): tilted sparrow-tile mark + bichrome wordmark.

export type MarkColorway = 'sakura' | 'cream';
export type MarkVariant = 'strong' | 'simple';
export type MarkTile = 'jade' | 'dark';

const PALETTE: Record<MarkColorway, { body: string; edge: string; ink: string; gold: string; wing: string }> = {
  sakura: { body: '#D45D83', edge: '#BE4970', ink: '#FBF6E9', gold: '#E0CF82', wing: '#BE4970' },
  cream: { body: '#FBF6E9', edge: 'rgba(33,75,64,0.14)', ink: '#214B40', gold: '#E0CF82', wing: '#E6DBBF' },
};
const TILE_BG: Record<MarkTile, string> = {
  jade: 'linear-gradient(160deg,#CDE9DA,#BBE0CD)',
  dark: 'linear-gradient(160deg,#2A5A4C,#1C4338)',
};

export interface SparrowMarkProps {
  readonly size?: number;
  readonly colorway?: MarkColorway;
  readonly variant?: MarkVariant;
  readonly letter?: string;
  readonly tilt?: boolean;
  // Wrap the mark in a rounded app-icon tile (jade / dark); omit for the bare symbol.
  readonly tile?: MarkTile;
}

// Geometry is expressed as fractions of `size` so the mark scales crisply.
function goldBar(s: number, l: number, t: number, len: number, th: number, rot: number, gold: string): CSSProperties {
  return {
    position: 'absolute',
    left: l * s,
    top: t * s,
    width: len * s,
    height: th * s,
    borderRadius: (th * s) / 2,
    background: gold,
    transformOrigin: 'left center',
    transform: `rotate(${rot}deg)`,
    boxShadow: '0 1px 2px rgba(33,75,64,0.18)',
  };
}

export function SparrowMark({ size = 64, colorway = 'sakura', variant = 'strong', letter, tilt = true, tile }: SparrowMarkProps) {
  const s = size;
  const p = PALETTE[colorway];
  const strong = variant === 'strong';
  const mark = (
    <div style={{ position: 'absolute', inset: 0, transform: tilt ? 'rotate(-9deg)' : undefined, transformOrigin: 'center' }}>
      <div style={goldBar(s, 0.255, 0.575, strong ? 0.23 : 0.2, 0.07, 166, p.gold)} />
      <div style={goldBar(s, 0.255, 0.615, strong ? 0.21 : 0.18, 0.07, 187, p.gold)} />
      {strong ? <div style={goldBar(s, 0.255, 0.655, 0.17, 0.07, 205, p.gold)} /> : null}
      <div
        style={{
          position: 'absolute',
          left: 0.24 * s,
          top: 0.24 * s,
          width: 0.52 * s,
          height: 0.52 * s,
          borderRadius: 0.16 * s,
          background: p.body,
          boxShadow: `inset 0 0 0 2px ${p.edge}, 0 4px 12px rgba(33,75,64,0.18)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Spline Sans Mono', ui-monospace, monospace",
          fontWeight: 600,
          fontSize: 0.3 * s,
          color: p.ink,
        }}
      >
        {letter}
      </div>
      {strong ? (
        <div style={{ position: 'absolute', left: 0.5 * s, top: 0.52 * s, width: 0.2 * s, height: 0.15 * s, borderRadius: '62% 50% 64% 50%', background: p.wing, transform: 'rotate(-20deg)', opacity: 0.9 }} />
      ) : null}
      <div style={{ position: 'absolute', left: 0.605 * s, top: 0.305 * s, width: 0.07 * s, height: 0.07 * s, borderRadius: '50%', background: p.ink }} />
      <div
        style={{
          position: 'absolute',
          left: 0.745 * s,
          top: 0.435 * s,
          width: 0,
          height: 0,
          borderTop: `${(strong ? 0.058 : 0.05) * s}px solid transparent`,
          borderBottom: `${(strong ? 0.058 : 0.05) * s}px solid transparent`,
          borderLeft: `${(strong ? 0.135 : 0.105) * s}px solid ${p.gold}`,
          transformOrigin: 'left center',
        }}
      />
    </div>
  );
  if (!tile) {
    return <div style={{ position: 'relative', width: s, height: s, flex: 'none' }} aria-hidden="true">{mark}</div>;
  }
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'relative',
        width: s,
        height: s,
        flex: 'none',
        borderRadius: 0.235 * s,
        background: TILE_BG[tile],
        overflow: 'hidden',
        boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.45), inset 0 0 0 1px rgba(33,75,64,0.07), 0 8px 22px rgba(33,75,64,0.16)',
      }}
    >
      {mark}
    </div>
  );
}

export type WordmarkTone = 'jade' | 'dark';
const TONE: Record<WordmarkTone, { word: string; sparrow: string }> = {
  jade: { word: '#214B40', sparrow: '#D45D83' },
  dark: { word: '#FBF6E9', sparrow: '#F3A9C2' },
};
const wordmark = css({ fontFamily: 'wsDisplay', lineHeight: '1', letterSpacing: '-0.015em', whiteSpace: 'nowrap' });

export interface WordmarkProps {
  readonly size?: number;
  readonly tone?: WordmarkTone;
}

export function Wordmark({ size = 46, tone = 'jade' }: WordmarkProps) {
  const t = TONE[tone];
  return (
    <span className={wordmark} style={{ fontSize: size }}>
      <span style={{ color: t.word, fontWeight: 500 }}>Word</span>
      <span style={{ color: t.sparrow, fontWeight: 600 }}>Sparrow</span>
    </span>
  );
}

export interface LockupProps {
  readonly orientation?: 'horizontal' | 'vertical';
  readonly tone?: WordmarkTone;
  readonly iconSize?: number;
  readonly textSize?: number;
  readonly gap?: number;
  readonly letter?: string;
}

export function Lockup({ orientation = 'horizontal', tone = 'jade', iconSize = 64, textSize = 46, gap = 18, letter }: LockupProps) {
  const wrap: CSSProperties = {
    display: 'inline-flex',
    flexDirection: orientation === 'vertical' ? 'column' : 'row',
    alignItems: 'center',
    gap,
  };
  // The mark stays sakura on both colorways; only the wordmark reverses.
  return (
    <span style={wrap} role="img" aria-label="WordSparrow">
      <SparrowMark size={iconSize} colorway="sakura" variant="strong" letter={letter} tilt />
      <Wordmark size={textSize} tone={tone} />
    </span>
  );
}
