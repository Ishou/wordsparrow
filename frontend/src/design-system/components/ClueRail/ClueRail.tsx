import { css, cx } from 'styled-system/css';

const rail = css({
  display: 'flex',
  alignItems: 'center',
  gap: 'sm',
  bg: 'white',
  borderRadius: 'md',
  padding: 'sm',
  boxShadow: 'floating',
});
const stepper = css({
  flexShrink: 0,
  width: '34px',
  height: '34px',
  borderRadius: 'sm',
  bg: 'ws.jade',
  color: 'ws.jadeInk',
  fontWeight: 'bold',
  cursor: 'pointer',
  _disabled: { opacity: 0.4, cursor: 'not-allowed' },
});
const body = css({ flex: 1, minWidth: 0 });
const label = css({ fontSize: 'xs', fontWeight: 'bold', letterSpacing: '0.06em', color: 'ws.khaki', display: 'flex', alignItems: 'center', gap: 'xs' });
const dot = css({ width: '7px', height: '7px', borderRadius: '999px', bg: 'ws.sakura' });
const clueText = css({ fontSize: 'md', fontWeight: 'semibold', color: 'ws.jadeInk', margin: 0, lineHeight: '1.2' });
const counter = css({ flexShrink: 0, fontSize: 'sm', fontWeight: 'semibold', color: 'ws.khaki' });

export type ClueDirection = 'horizontal' | 'vertical';

export interface ClueRailProps {
  readonly direction: ClueDirection;
  readonly clue: string;
  readonly index: number;
  readonly total: number;
  readonly onPrev?: () => void;
  readonly onNext?: () => void;
}

const DIRECTION_LABEL: Record<ClueDirection, string> = { horizontal: 'HORIZONTAL ›', vertical: 'VERTICAL ⌄' };

export function ClueRail({ direction, clue, index, total, onPrev, onNext }: ClueRailProps) {
  return (
    <div className={rail} role="group" aria-label="Indice actif">
      <button type="button" className={stepper} onClick={onPrev} disabled={index <= 1} aria-label="Indice précédent">‹</button>
      <div className={body}>
        <p className={label}><span aria-hidden="true" className={dot} />{DIRECTION_LABEL[direction]}</p>
        <p className={clueText}>{clue}</p>
      </div>
      <span className={cx(counter)} aria-label={`Indice ${index} sur ${total}`}>{index} / {total}</span>
      <button type="button" className={stepper} onClick={onNext} disabled={index >= total} aria-label="Indice suivant">›</button>
    </div>
  );
}
