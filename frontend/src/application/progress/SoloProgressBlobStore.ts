// Whole-blob local access for the sync layer (ADR-0075 §4). The cell-level
// `SoloEntriesStore` can't read/replace a puzzle's full blob, which the merge
// needs; this port gives that without disturbing the render-path store.

import type { SoloStorePayload } from './SoloStorePayload';

export interface SoloProgressBlobStore {
  // The current device's full blob for one puzzle (empty payload when none).
  loadPayload(sessionId: string, puzzleId: string): SoloStorePayload;
  // Replaces the puzzle's blob wholesale (used after a merge).
  replacePayload(sessionId: string, puzzleId: string, payload: SoloStorePayload): void;
  // All puzzle ids the device currently has local progress for.
  listPuzzleIds(sessionId: string): ReadonlyArray<string>;
}
