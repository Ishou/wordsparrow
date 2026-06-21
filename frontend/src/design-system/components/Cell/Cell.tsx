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

// Raised keycaps carry a solid bottom edge + ambient shadow; a solved cell
// flattens (inset) — that drop is the solve motion's resting state.
const byState = {
  empty: css({
    bgImage: 'linear-gradient(180deg, #FBFAF3, #EFEADB)',
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
