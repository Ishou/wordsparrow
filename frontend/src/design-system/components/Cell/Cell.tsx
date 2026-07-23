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
    _dark: {
      bgImage: 'linear-gradient(180deg, #2C3830, #232E27)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2.5px 0 0 #17211B, 0 3px 5px -3px rgba(0,0,0,0.4)',
    },
  }),
  // Typed-but-unlocked: raised keycap like empty, warmer sand face so filled progress reads apart from empty at a glance.
  filled: css({
    bgImage: 'linear-gradient(180deg, #EDE6CF, #E0D7BC)',
    color: 'ws.khaki',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75), 0 2.5px 0 0 #DCD6C5, 0 3px 5px -3px rgba(33,75,64,0.16)',
    _dark: {
      bgImage: 'linear-gradient(180deg, #35402F, #2A3626)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2.5px 0 0 #17211B, 0 3px 5px -3px rgba(0,0,0,0.4)',
    },
  }),
  solved: css({
    bg: 'ws.cellSolved',
    color: 'ws.khaki',
    boxShadow: 'inset 0 1px 3px rgba(33,75,64,0.16), inset 0 0 0 1px rgba(33,75,64,0.07)',
    _dark: { boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(233,242,236,0.06)' },
  }),
  activeWord: css({
    bg: 'ws.sakuraBlush',
    color: 'ws.khaki',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 0 0 1.5px rgba(212,93,131,0.5), 0 4px 0 0 #E9C3D0, 0 4px 6px -3px rgba(33,75,64,0.2)',
    _dark: { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1.5px rgba(212,93,131,0.5), 0 4px 0 0 #4A2635, 0 4px 6px -3px rgba(0,0,0,0.4)' },
  }),
  active: css({
    bg: 'ws.sakura',
    color: 'white',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 2px token(colors.ws.sakuraDark), 0 4px 0 0 #A84362, 0 4px 6px -3px rgba(33,75,64,0.24)',
    _dark: {
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 2px token(colors.ws.sakuraDark), 0 4px 0 0 #7E3149, 0 4px 6px -3px rgba(0,0,0,0.4)',
    },
  }),
} as const;

// Opt-in flatten ripple, played once when a cell becomes solved.
const solveRipple = css({ animation: 'wsFlatten 0.26s ease both' });

// ADR-0086: co-op solved fill tinted with the finder's `--player-color`.
const solvedTint = css({ bg: 'color-mix(in srgb, var(--player-color) 32%, token(colors.ws.cellSolved))' });

// Discreet 1px selection ring on a solved/locked cell whose word is currently selected — an outline (not box-shadow) so it never clobbers the solved inset shadow. Rose in dark mode clears WCAG 1.4.11 on the dark solved fill.
const selectedRing = css({
  outline: '1px solid token(colors.ws.sakuraDark)',
  outlineOffset: '-1px',
  _dark: { outlineColor: 'token(colors.ws.sakuraRose)' },
});

export type CellState = keyof typeof byState;

export interface CellProps {
  readonly state: CellState;
  readonly letter?: string;
  // ms stagger for the solve ripple; omit to render solved statically (no motion).
  readonly solveDelay?: number;
  // ADR-0086: when solved, tint the fill from the ancestor's `--player-color`.
  readonly tinted?: boolean;
  // When solved/locked, mark this cell as part of the currently-selected word — layers a selection outline over the solved fill.
  readonly selected?: boolean;
}

export function Cell({ state, letter, solveDelay, tinted, selected }: CellProps) {
  const ripple = state === 'solved' && solveDelay !== undefined;
  const showSelected = state === 'solved' && selected === true;
  return (
    <div
      data-cell-state={state}
      data-selected={showSelected ? 'true' : undefined}
      className={cx(base, byState[state], ripple && solveRipple, state === 'solved' && tinted && solvedTint, showSelected && selectedRing)}
      style={ripple ? { animationDelay: `${solveDelay}ms` } : undefined}
    >
      {state === 'empty' ? '' : letter}
    </div>
  );
}
