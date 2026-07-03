import type { ReactNode } from 'react';
import { CaretLeft, CaretRight, CaretDown, Minus, Plus } from '@phosphor-icons/react';
import { css } from 'styled-system/css';

const rail = css({
  bg: 'ws.card',
  borderRadius: '16px',
  padding: '13px 16px 14px',
  boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 8px 22px rgba(33,75,64,0.10)',
  _dark: { boxShadow: '0 1px 2px rgba(0,0,0,0.3), 0 8px 22px rgba(0,0,0,0.35)' },
});
const topRow = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '9px' });
const labelGroup = css({ display: 'flex', alignItems: 'center', gap: '8px' });
const dot = css({ width: '7px', height: '7px', borderRadius: '999px', bg: 'ws.sakura', flexShrink: 0 });
const label = css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.14em', color: '#6B520F',
  _dark: { color: '#CBBE83' }, display: 'inline-flex', alignItems: 'center', gap: '4px' });
const sep = css({ width: '1px', height: '11px', bg: 'rgba(76,72,36,0.22)', _dark: { bg: 'rgba(233,242,236,0.2)' } });
const counter = css({ fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'semibold', color: 'ws.khaki', opacity: 0.7, whiteSpace: 'nowrap' });

const rightGroup = css({ display: 'flex', alignItems: 'center', gap: '10px' });
const zoom = css({ display: 'flex', alignItems: 'center', bg: '#F2EDDC', borderRadius: '9px', overflow: 'hidden', _dark: { bg: '#2A362E' } });
const zoomBtn = css({ width: '32px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', bg: 'transparent', border: 'none', color: 'ws.jadeInk', cursor: 'pointer' });
const zoomSep = css({ width: '1px', height: '15px', bg: 'rgba(33,75,64,0.16)', _dark: { bg: 'rgba(233,242,236,0.14)' } });

const mainRow = css({ display: 'flex', alignItems: 'center', gap: '10px' });
const stepper = css({
  flex: 'none',
  width: '40px',
  height: '40px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '13px',
  bg: '#F2EDDC',
  color: 'ws.jadeInk',
  _dark: { bg: '#2A362E' },
  fontSize: '18px',
  cursor: 'pointer',
  _disabled: { opacity: 0.4, cursor: 'not-allowed' },
});
const clueText = css({ flex: 1, textAlign: 'center', fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '20px', lineHeight: '1.12', letterSpacing: '-0.01em', color: 'ws.jadeInk' });

export type ClueDirection = 'horizontal' | 'vertical';

export interface ClueRailProps {
  readonly direction: ClueDirection;
  readonly clue: string;
  readonly index: number;
  readonly total: number;
  readonly onPrev?: () => void;
  readonly onNext?: () => void;
  readonly onZoomIn?: () => void;
  readonly onZoomOut?: () => void;
  // Replaces the index/total counter in the label row (e.g. a hint control); index/total still drive prev/next bounds.
  readonly trailing?: ReactNode;
}

const DIRECTION_TEXT: Record<ClueDirection, string> = { horizontal: 'HORIZONTAL', vertical: 'VERTICAL' };

export function ClueRail({ direction, clue, index, total, onPrev, onNext, onZoomIn, onZoomOut, trailing }: ClueRailProps) {
  return (
    <div className={rail} role="group" aria-label="Indice actif">
      <div className={topRow}>
        <div className={labelGroup}>
          <span aria-hidden="true" className={dot} />
          <span className={label}>
            {DIRECTION_TEXT[direction]}
            {direction === 'horizontal'
              ? <CaretRight aria-hidden="true" weight="bold" />
              : <CaretDown aria-hidden="true" weight="bold" />}
          </span>
          {trailing ? null : (
            <>
              <span aria-hidden="true" className={sep} />
              <span className={counter} aria-label={`Indice ${index} sur ${total}`}>{index} / {total}</span>
            </>
          )}
        </div>
        <div className={rightGroup}>
          {trailing}
          <div className={zoom}>
            <button type="button" className={zoomBtn} onClick={onZoomOut} aria-label="Dézoomer"><Minus aria-hidden="true" weight="bold" /></button>
            <span aria-hidden="true" className={zoomSep} />
            <button type="button" className={zoomBtn} onClick={onZoomIn} aria-label="Zoomer"><Plus aria-hidden="true" weight="bold" /></button>
          </div>
        </div>
      </div>
      <div className={mainRow}>
        <button type="button" className={stepper} onClick={onPrev} disabled={!onPrev || total <= 1} aria-label="Indice précédent"><CaretLeft aria-hidden="true" weight="bold" /></button>
        <div className={clueText}>{clue}</div>
        <button type="button" className={stepper} onClick={onNext} disabled={!onNext || total <= 1} aria-label="Indice suivant"><CaretRight aria-hidden="true" weight="bold" /></button>
      </div>
    </div>
  );
}
