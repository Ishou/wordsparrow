import { describe, expect, it, vi } from 'vitest';
import { createSyncingSoloEntriesStore } from '@/application/progress';
import type { SoloEntriesStore, SoloEntry, SoloLockedCell } from '@/application/solo/SoloEntriesStore';

function memStore(): SoloEntriesStore {
  const entries = new Map<string, SoloEntry[]>();
  const locked = new Map<string, SoloLockedCell[]>();
  const hints = new Map<string, number>();
  return {
    load: (puzzleId) => entries.get(puzzleId) ?? [],
    loadLockedCells: (puzzleId) => locked.get(puzzleId) ?? [],
    loadHintsUsed: (puzzleId) => hints.get(puzzleId) ?? 0,
    save: (puzzleId, row, column, letter) => {
      const prev = entries.get(puzzleId) ?? [];
      const filtered = prev.filter((e) => !(e.row === row && e.column === column));
      entries.set(puzzleId, letter !== null ? [...filtered, { row, column, letter }] : filtered);
    },
    lockCell: (puzzleId, row, column) => {
      locked.set(puzzleId, [...(locked.get(puzzleId) ?? []), { row, column }]);
    },
    recordHintUsed: (puzzleId) => {
      hints.set(puzzleId, (hints.get(puzzleId) ?? 0) + 1);
    },
    clearForPuzzle: (puzzleId) => {
      entries.delete(puzzleId);
      locked.delete(puzzleId);
      hints.delete(puzzleId);
    },
  };
}

const PUZZLE = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

describe('createSyncingSoloEntriesStore', () => {
  it('notifies on each mutating op and forwards to the inner store', () => {
    const inner = memStore();
    const onMutate = vi.fn();
    const store = createSyncingSoloEntriesStore(inner, onMutate);

    store.save(PUZZLE, 0, 0, 'A');
    expect(inner.load(PUZZLE)).toEqual([{ row: 0, column: 0, letter: 'A' }]);

    store.lockCell(PUZZLE, 1, 1);
    expect(inner.loadLockedCells(PUZZLE)).toEqual([{ row: 1, column: 1 }]);

    store.recordHintUsed(PUZZLE);
    expect(inner.loadHintsUsed(PUZZLE)).toBe(1);

    store.clearForPuzzle(PUZZLE);
    expect(inner.load(PUZZLE)).toEqual([]);

    expect(onMutate).toHaveBeenCalledTimes(4);
    expect(onMutate).toHaveBeenNthCalledWith(1, PUZZLE);
  });

  it('does not notify on read-only ops', () => {
    const inner = memStore();
    const onMutate = vi.fn();
    const store = createSyncingSoloEntriesStore(inner, onMutate);

    store.load(PUZZLE);
    store.loadLockedCells(PUZZLE);
    store.loadHintsUsed(PUZZLE);

    expect(onMutate).not.toHaveBeenCalled();
  });
});
