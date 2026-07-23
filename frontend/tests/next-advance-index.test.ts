import { describe, expect, it } from 'vitest';
import type { LetterCell, Position } from '@/domain';
import { nextAdvanceIndex } from '@/ui/components/grid/useGridNavigation';

const cell = (col: number): LetterCell => ({ kind: 'letter', position: { row: 0, col }, entry: '' });
// Word of 5 cells at row 0, cols 0..4.
const WORD: readonly LetterCell[] = [cell(0), cell(1), cell(2), cell(3), cell(4)];
const filledCols = (cols: number[]) => (p: Position) => cols.includes(p.col);

describe('nextAdvanceIndex', () => {
  it('skip off: returns the immediate next index even when that cell is filled', () => {
    expect(nextAdvanceIndex(WORD, 0, false, filledCols([1]))).toBe(1);
  });

  it('skip off: returns null at the last cell', () => {
    expect(nextAdvanceIndex(WORD, 4, false, filledCols([]))).toBeNull();
  });

  it('skip on: hops over a filled cell to the next empty one', () => {
    // From idx 0; cols 1 and 2 filled → first empty ahead is idx 3.
    expect(nextAdvanceIndex(WORD, 0, true, filledCols([1, 2]))).toBe(3);
  });

  it('skip on: lands on the immediate next cell when it is already empty', () => {
    expect(nextAdvanceIndex(WORD, 0, true, filledCols([3]))).toBe(1);
  });

  it('skip on: falls back to the immediate next cell when all cells ahead are filled', () => {
    // From idx 1; cols 2,3,4 filled → no empty ahead → fallback idx 2.
    expect(nextAdvanceIndex(WORD, 1, true, filledCols([2, 3, 4]))).toBe(2);
  });

  it('skip on: returns null when already at the last cell', () => {
    expect(nextAdvanceIndex(WORD, 4, true, filledCols([]))).toBeNull();
  });

  it('returns null for a not-found index (< 0)', () => {
    expect(nextAdvanceIndex(WORD, -1, true, filledCols([]))).toBeNull();
  });
});
