import { css, cx } from 'styled-system/css';

const base = css({
  aspectRatio: '1',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 'bold',
  fontSize: '1.4em',
  borderRadius: '9px',
  userSelect: 'none',
});

const byState = {
  empty: css({ bg: 'white', boxShadow: '0 2px 4px rgba(15, 45, 35, 0.12)' }),
  solved: css({ bg: 'ws.sable', color: 'ws.khaki' }),
  // Deeper-sakura inner ring keeps the active word legible on the jade field.
  active: css({ bg: 'ws.sakura', color: 'white', boxShadow: 'inset 0 0 0 2px #BE4970' }),
} as const;

export type CellState = keyof typeof byState;

export interface CellProps {
  readonly state: CellState;
  readonly letter?: string;
}

export function Cell({ state, letter }: CellProps) {
  return (
    <div data-cell-state={state} className={cx(base, byState[state])}>
      {state === 'empty' ? '' : letter}
    </div>
  );
}
