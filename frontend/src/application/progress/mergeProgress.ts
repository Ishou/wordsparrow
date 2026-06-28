// Pure semantic merge of two solo-progress blobs (ADR-0075 §4).

import { cellKey, type SoloStoreLock, type SoloStorePayload } from './SoloStorePayload';

export interface TimestampedPayload {
  readonly payload: SoloStorePayload;
  // Server-stamped write time of this blob; missing/empty ⇒ oldest (loses collisions).
  readonly updatedAt?: string;
}

// Returns true when `a` is the same age or newer than `b` — used so that on
// a per-cell collision the blob whose updatedAt is greater keeps its letter.
function isAtLeastAsRecent(a?: string, b?: string): boolean {
  if (!a) return false;
  if (!b) return true;
  return a >= b;
}

export function mergeProgress(
  local: TimestampedPayload,
  remote: TimestampedPayload,
): SoloStorePayload {
  const localWinsCollision = isAtLeastAsRecent(local.updatedAt, remote.updatedAt);

  const byCell = new Map<string, { r: number; c: number; l: string }>();
  // Seed with the loser first so the winner's colliding letter overwrites it.
  const ordered = localWinsCollision
    ? [remote.payload.entries, local.payload.entries]
    : [local.payload.entries, remote.payload.entries];
  for (const entries of ordered) {
    for (const e of entries) {
      byCell.set(cellKey(e.r, e.c), { r: e.r, c: e.c, l: e.l });
    }
  }

  const lockKeys = new Set<string>();
  const lockedCells: SoloStoreLock[] = [];
  for (const lock of [...local.payload.lockedCells, ...remote.payload.lockedCells]) {
    const key = cellKey(lock.r, lock.c);
    if (lockKeys.has(key)) continue;
    lockKeys.add(key);
    lockedCells.push({ r: lock.r, c: lock.c });
  }

  return {
    entries: [...byCell.values()],
    lockedCells,
    hintsUsed: Math.max(local.payload.hintsUsed, remote.payload.hintsUsed),
  };
}
