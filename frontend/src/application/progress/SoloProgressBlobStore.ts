// Whole-blob read/replace port for the sync merge layer (ADR-0075 §4).

import type { SoloStorePayload } from './SoloStorePayload';

export interface SoloProgressBlobStore {
  // The current device's full blob for one puzzle (empty payload when none).
  loadPayload(sessionId: string, puzzleId: string): SoloStorePayload;
  // Wall-clock of the blob's last local mutation; feeds the merge so a fresh unpushed edit outranks a stale remote (ADR-0075 §4). Undefined ⇒ never mutated locally.
  loadLocalUpdatedAt(sessionId: string, puzzleId: string): string | undefined;
  // Replaces the puzzle's blob wholesale (used after a merge).
  replacePayload(sessionId: string, puzzleId: string, payload: SoloStorePayload): void;
  // All puzzle ids the device currently has local progress for.
  listPuzzleIds(sessionId: string): ReadonlyArray<string>;
}
