import { css, cx } from 'styled-system/css';

const base = css({
  aspectRatio: '1',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'wsMono',
  fontWeight: 'semibold',
  fontSize: '1.5em',
  borderRadius: '9px',
  userSelect: 'none',
});

// Raised keycap relief + inset solved state = the visual "settle" on correct entry.
const byState = {
  empty: css({
    bgImage: 'linear-gradient(180deg, #FBFAF3, #EFEADB)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75), 0 2.5px 0 0 #DCD6C5, 0 3px 5px -3px rgba(33,75,64,0.16)',
  }),
  // A typed-but-unlocked cell: still a raised keycap, but now carries its letter.
  filled: css({
    bgImage: 'linear-gradient(180deg, #FBFAF3, #EFEADB)',
    color: 'ws.khaki',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75), 0 2.5px 0 0 #DCD6C5, 0 3px 5px -3px rgba(33,75,64,0.16)',
  }),
  solved: css({
    bg: 'ws.sable',
    color: 'ws.khaki',
    boxShadow: 'inset 0 1px 3px rgba(33,75,64,0.16), inset 0 0 0 1px rgba(33,75,64,0.07)',
  }),
  activeWord: css({
    bg: 'ws.sakuraBlush',
    color: 'ws.khaki',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 0 0 1.5px rgba(212,93,131,0.5), 0 4px 0 0 #E9C3D0, 0 4px 6px -3px rgba(33,75,64,0.2)',
  }),
  active: css({
    bg: 'ws.sakura',
    color: 'white',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 2px token(colors.ws.sakuraDark), 0 4px 0 0 #A84362, 0 4px 6px -3px rgba(33,75,64,0.24)',
  }),
} as const;

// Opt-in flatten ripple, played once when a cell becomes solved.
const solveRipple = css({ animation: 'wsFlatten 0.26s ease both' });

// ADR-0086: co-op solved fill tinted with the finder's `--player-color`.
const solvedTint = css({ bg: 'color-mix(in srgb, var(--player-color) 32%, token(colors.ws.sable))' });

export type CellState = keyof typeof byState;

export interface CellProps {
  readonly state: CellState;
  readonly letter?: string;
  // ms stagger for the solve ripple; omit to render solved statically (no motion).
  readonly solveDelay?: number;
  // ADR-0086: when solved, tint the fill from the ancestor's `--player-color`.
  readonly tinted?: boolean;
}

export function Cell({ state, letter, solveDelay, tinted }: CellProps) {
  const ripple = state === 'solved' && solveDelay !== undefined;
  return (
    <div
      data-cell-state={state}
      className={cx(base, byState[state], ripple && solveRipple, state === 'solved' && tinted && solvedTint)}
      style={ripple ? { animationDelay: `${solveDelay}ms` } : undefined}
    >
      {state === 'empty' ? '' : letter}
    </div>
  );
}
