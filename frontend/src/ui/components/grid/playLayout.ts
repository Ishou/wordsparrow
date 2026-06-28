import type { ArrowDirection } from '@/domain';

// Fixed board geometry shared by the solo + co-op grids: the grid never reflows — PanZoom scales/pans it.
export const CELL = 56;
export const GAP = 5;
export const STRIDE = CELL + GAP;
// Breathing gap at the pan extreme, mirroring padTop's gap above the first row.
export const BOARD_BOTTOM_GAP = 14;

export function posKey(row: number, col: number): string {
  return `${row},${col}`;
}

// A definition clue exits rightward (across) rather than downward — drives the stacked-def-cell sort.
export const exitsRight = (a: ArrowDirection): boolean => a === 'right' || a === 'right-down';
