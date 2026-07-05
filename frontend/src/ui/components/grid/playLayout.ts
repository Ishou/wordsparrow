import type { ArrowDirection } from '@/domain';

// Fixed board geometry shared by the solo + co-op grids: the grid never reflows — PanZoom scales/pans it.
export const CELL = 56;
export const GAP = 5;
export const STRIDE = CELL + GAP;
// Breathing gap at the pan extreme, mirroring padTop's gap above the first row.
export const BOARD_BOTTOM_GAP = 14;

// Per-letter stagger for the solve celebration (flatten ripple / mini-game glow),
// shared so every surface — and its sound pulse — celebrates at one cadence.
export const SOLVE_STAGGER_MS = 45;

export function posKey(row: number, col: number): string {
  return `${row},${col}`;
}

// A definition clue exits rightward (across) rather than downward — drives the stacked-def-cell sort.
export const exitsRight = (a: ArrowDirection): boolean => a === 'right' || a === 'right-down';
