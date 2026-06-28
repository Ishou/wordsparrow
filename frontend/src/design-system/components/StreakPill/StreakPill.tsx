import { css } from 'styled-system/css';

export interface StreakPillProps {
  readonly streak: number;
  readonly timer?: string;
}

// Frosted-glass pill; the 🔥 stays an emoji per the design source of truth.
const pill = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  bg: 'rgba(255,255,255,0.6)',
  backdropFilter: 'blur(8px)',
  border: '0.5px solid rgba(255,255,255,0.7)',
  color: 'ws.jadeInk',
  fontFamily: 'wsUi',
  fontWeight: 'black',
  fontSize: '14px',
  paddingInline: '13px',
  paddingBlock: '7px',
  borderRadius: '999px',
  boxShadow: '0 1px 3px rgba(33,75,64,0.1)',
});
const sep = css({ width: '1px', height: '14px', bg: 'rgba(33,75,64,0.18)' });

export function StreakPill({ streak, timer }: StreakPillProps) {
  return (
    <span className={pill}>
      <span aria-hidden="true" className={css({ fontSize: '13px' })}>🔥</span>
      <span aria-label={`Série de ${streak} jours`}>{streak}</span>
      {timer ? (
        <>
          <span aria-hidden="true" className={sep} />
          <span className={css({ fontWeight: 'bold' })}>{timer}</span>
        </>
      ) : null}
    </span>
  );
}
