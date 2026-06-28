// Wraps a SoloEntriesStore so each local mutation notifies the sync layer
// (ADR-0075 Wave 3). Reads are untouched — the render path keeps hitting the
// inner store with no added latency. `onMutate` is a no-op when unauthed.

import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';

export function createSyncingSoloEntriesStore(
  inner: SoloEntriesStore,
  onMutate: (puzzleId: string) => void,
): SoloEntriesStore {
  return {
    load: (puzzleId) => inner.load(puzzleId),
    loadLockedCells: (puzzleId) => inner.loadLockedCells(puzzleId),
    loadHintsUsed: (puzzleId) => inner.loadHintsUsed(puzzleId),
    save: (puzzleId, row, column, letter) => {
      inner.save(puzzleId, row, column, letter);
      onMutate(puzzleId);
    },
    lockCell: (puzzleId, row, column) => {
      inner.lockCell(puzzleId, row, column);
      onMutate(puzzleId);
    },
    recordHintUsed: (puzzleId) => {
      inner.recordHintUsed(puzzleId);
      onMutate(puzzleId);
    },
    clearForPuzzle: (puzzleId) => {
      inner.clearForPuzzle(puzzleId);
      onMutate(puzzleId);
    },
  };
}
