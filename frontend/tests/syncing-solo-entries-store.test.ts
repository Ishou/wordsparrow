import { describe, expect, it, vi } from 'vitest';
import { createSyncingSoloEntriesStore } from '@/application/progress';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';

function spyStore(): SoloEntriesStore {
  return {
    load: vi.fn(() => []),
    loadLockedCells: vi.fn(() => []),
    loadHintsUsed: vi.fn(() => 0),
    save: vi.fn(),
    lockCell: vi.fn(),
    recordHintUsed: vi.fn(),
    clearForPuzzle: vi.fn(),
  };
}

const PUZZLE = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

describe('createSyncingSoloEntriesStore', () => {
  it('notifies on each mutating op and forwards to the inner store', () => {
    const inner = spyStore();
    const onMutate = vi.fn();
    const store = createSyncingSoloEntriesStore(inner, onMutate);

    store.save(PUZZLE, 0, 0, 'A');
    store.lockCell(PUZZLE, 1, 1);
    store.recordHintUsed(PUZZLE);
    store.clearForPuzzle(PUZZLE);

    expect(inner.save).toHaveBeenCalledWith(PUZZLE, 0, 0, 'A');
    expect(inner.lockCell).toHaveBeenCalledWith(PUZZLE, 1, 1);
    expect(inner.recordHintUsed).toHaveBeenCalledWith(PUZZLE);
    expect(inner.clearForPuzzle).toHaveBeenCalledWith(PUZZLE);
    expect(onMutate).toHaveBeenCalledTimes(4);
    expect(onMutate).toHaveBeenNthCalledWith(1, PUZZLE);
  });

  it('does not notify on read-only ops', () => {
    const inner = spyStore();
    const onMutate = vi.fn();
    const store = createSyncingSoloEntriesStore(inner, onMutate);

    store.load(PUZZLE);
    store.loadLockedCells(PUZZLE);
    store.loadHintsUsed(PUZZLE);

    expect(onMutate).not.toHaveBeenCalled();
  });
});
