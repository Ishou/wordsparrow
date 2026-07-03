import { describe, expect, it } from 'vitest';
import { countFilledCells, type SoloEntriesStore } from '@/application/solo/SoloEntriesStore';

function stubStore(overrides: Partial<SoloEntriesStore>): SoloEntriesStore {
  return {
    load: () => [],
    save: () => {},
    loadLockedCells: () => [],
    lockCell: () => {},
    loadHintsUsed: () => 0,
    recordHintUsed: () => {},
    loadElapsed: () => 0,
    saveElapsed: () => {},
    clearForPuzzle: () => {},
    ...overrides,
  };
}

describe('countFilledCells', () => {
  it('counts typed entries when nothing is locked (solo grids only lock on full validation)', () => {
    const store = stubStore({
      load: () => [
        { row: 0, column: 0, letter: 'A' },
        { row: 0, column: 1, letter: 'B' },
      ],
    });
    expect(countFilledCells(store, 'p1')).toBe(2);
  });

  it('unions entries with locked cells without double-counting a hint-revealed cell', () => {
    const store = stubStore({
      load: () => [
        { row: 0, column: 0, letter: 'A' },
        { row: 1, column: 2, letter: 'C' },
      ],
      loadLockedCells: () => [
        { row: 1, column: 2 },
        { row: 3, column: 3 },
      ],
    });
    expect(countFilledCells(store, 'p1')).toBe(3);
  });

  it('ignores blank entries', () => {
    const store = stubStore({ load: () => [{ row: 0, column: 0, letter: '' }] });
    expect(countFilledCells(store, 'p1')).toBe(0);
  });
});
