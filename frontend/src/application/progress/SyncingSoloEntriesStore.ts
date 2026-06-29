// Decorator that fires onMutate on each write so the sync layer can debounce pushes (ADR-0075).

import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';

export function createSyncingSoloEntriesStore(
  inner: SoloEntriesStore,
  onMutate: (puzzleId: string) => void,
): SoloEntriesStore {
  return {
    load: (puzzleId) => inner.load(puzzleId),
    loadLockedCells: (puzzleId) => inner.loadLockedCells(puzzleId),
    loadHintsUsed: (puzzleId) => inner.loadHintsUsed(puzzleId),
    loadElapsed: (puzzleId) => inner.loadElapsed(puzzleId),
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
    saveElapsed: (puzzleId, seconds) => {
      inner.saveElapsed(puzzleId, seconds);
      onMutate(puzzleId);
    },
    clearForPuzzle: (puzzleId) => {
      inner.clearForPuzzle(puzzleId);
      onMutate(puzzleId);
    },
  };
}
