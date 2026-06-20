import { css } from 'styled-system/css';

export interface StreakPillProps {
  readonly streak: number;
  readonly timer?: string;
}

const pill = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'xs',
  bg: 'rgba(255, 255, 255, 0.74)',
  color: 'ws.jadeInk',
  fontWeight: 'bold',
  fontSize: 'sm',
  paddingInline: 'sm',
  paddingBlock: 'xs',
  borderRadius: '999px',
});

export function StreakPill({ streak, timer }: StreakPillProps) {
  return (
    <span className={pill}>
      <span aria-hidden="true">🔥</span>
      <span aria-label={`Série de ${streak} jours`}>{streak}</span>
      {timer ? <span aria-hidden="true">· {timer}</span> : null}
    </span>
  );
}
