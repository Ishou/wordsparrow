// In application/ (not domain/): entry storage is a use-case concern, not a domain invariant.

export interface SoloEntry {
  readonly row: number;
  readonly column: number;
  readonly letter: string;
}

export interface SoloLockedCell {
  readonly row: number;
  readonly column: number;
}

export interface SoloEntriesStore {
  load(puzzleId: string): ReadonlyArray<SoloEntry>;
  save(puzzleId: string, row: number, column: number, letter: string | null): void;
  loadLockedCells(puzzleId: string): ReadonlyArray<SoloLockedCell>;
  lockCell(puzzleId: string, row: number, column: number): void;
  // Number of hints already consumed on this puzzle (0 when none).
  // The hint counter is ephemeral React state; persisting the running
  // tally per-puzzle lets a page reload restore `hintsRemaining` from
  // `hintsAllowed - loadHintsUsed(puzzleId)`.
  loadHintsUsed(puzzleId: string): number;
  recordHintUsed(puzzleId: string): void;
  // Elapsed play time in seconds (0 when none) so a reload resumes instead of restarting.
  loadElapsed(puzzleId: string): number;
  saveElapsed(puzzleId: string, seconds: number): void;
  clearForPuzzle(puzzleId: string): void;
}

// Distinct cells the player has content in — typed entries ∪ locked cells; solo grids only lock on full validation or hints, so progress UIs must count entries too.
export function countFilledCells(store: SoloEntriesStore, puzzleId: string): number {
  const keys = new Set<string>();
  for (const e of store.load(puzzleId)) if (e.letter !== '') keys.add(`${e.row}:${e.column}`);
  for (const c of store.loadLockedCells(puzzleId)) keys.add(`${c.row}:${c.column}`);
  return keys.size;
}

export interface SoloEntriesStoreDeps {
  readonly getSessionId: () => string;
  readonly storage: SoloEntriesStorage;
}

// Port implemented by infrastructure; tests inject an in-memory version.
export interface SoloEntriesStorage {
  loadEntries(sessionId: string, puzzleId: string): ReadonlyArray<SoloEntry>;
  saveLetter(
    sessionId: string,
    puzzleId: string,
    row: number,
    column: number,
    letter: string | null,
  ): void;
  loadLocked(sessionId: string, puzzleId: string): ReadonlyArray<SoloLockedCell>;
  lockCell(sessionId: string, puzzleId: string, row: number, column: number): void;
  loadHintsUsed(sessionId: string, puzzleId: string): number;
  recordHintUsed(sessionId: string, puzzleId: string): void;
  loadElapsed(sessionId: string, puzzleId: string): number;
  saveElapsed(sessionId: string, puzzleId: string, seconds: number): void;
  clearForPuzzle(sessionId: string, puzzleId: string): void;
}

// getSessionId() is called on every op so session rotation (RGPD erase → reseed) is transparent.
export function createSoloEntriesStore(deps: SoloEntriesStoreDeps): SoloEntriesStore {
  const { getSessionId, storage } = deps;
  return {
    load: (puzzleId) => storage.loadEntries(getSessionId(), puzzleId),
    save: (puzzleId, row, column, letter) =>
      storage.saveLetter(getSessionId(), puzzleId, row, column, letter),
    loadLockedCells: (puzzleId) => storage.loadLocked(getSessionId(), puzzleId),
    lockCell: (puzzleId, row, column) =>
      storage.lockCell(getSessionId(), puzzleId, row, column),
    loadHintsUsed: (puzzleId) => storage.loadHintsUsed(getSessionId(), puzzleId),
    recordHintUsed: (puzzleId) => storage.recordHintUsed(getSessionId(), puzzleId),
    loadElapsed: (puzzleId) => storage.loadElapsed(getSessionId(), puzzleId),
    saveElapsed: (puzzleId, seconds) => storage.saveElapsed(getSessionId(), puzzleId, seconds),
    clearForPuzzle: (puzzleId) => storage.clearForPuzzle(getSessionId(), puzzleId),
  };
}
