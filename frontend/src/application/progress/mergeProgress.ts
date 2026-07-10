// Pure semantic merge of two solo-progress blobs (ADR-0075 §4).

import { cellKey, type SoloStoreLock, type SoloStorePayload } from './SoloStorePayload';

export interface TimestampedPayload {
  readonly payload: SoloStorePayload;
  // Server-stamped write time of this blob; missing/empty ⇒ oldest (loses collisions).
  readonly updatedAt?: string;
}

// Returns true when `a` is the same age or newer than `b`; missing timestamp loses collisions.
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

  const localLocks = new Set(local.payload.lockedCells.map((l) => cellKey(l.r, l.c)));
  const remoteLocks = new Set(remote.payload.lockedCells.map((l) => cellKey(l.r, l.c)));

  // A locked letter is validated ground truth, so it outranks any unlocked colliding guess regardless of blob age; timestamp only breaks equal-lock-status collisions.
  const byCell = new Map<string, { r: number; c: number; l: string; priority: number }>();
  const consider = (e: { r: number; c: number; l: string }, locked: boolean, wins: boolean) => {
    const priority = (locked ? 2 : 0) + (wins ? 1 : 0);
    const key = cellKey(e.r, e.c);
    const existing = byCell.get(key);
    if (existing === undefined || priority > existing.priority) {
      byCell.set(key, { r: e.r, c: e.c, l: e.l, priority });
    }
  };
  for (const e of local.payload.entries) {
    consider(e, localLocks.has(cellKey(e.r, e.c)), localWinsCollision);
  }
  for (const e of remote.payload.entries) {
    consider(e, remoteLocks.has(cellKey(e.r, e.c)), !localWinsCollision);
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
    entries: [...byCell.values()].map(({ r, c, l }) => ({ r, c, l })),
    lockedCells,
    hintsUsed: Math.max(local.payload.hintsUsed, remote.payload.hintsUsed),
    // Total time is monotonic; two devices both counting ⇒ keep the larger.
    elapsedSeconds: Math.max(local.payload.elapsedSeconds, remote.payload.elapsedSeconds),
  };
}
