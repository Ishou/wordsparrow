// Opaque per-puzzle blob shape synced to identity (ADR-0075).

export interface SoloStoreEntry {
  readonly r: number;
  readonly c: number;
  readonly l: string;
}

export interface SoloStoreLock {
  readonly r: number;
  readonly c: number;
}

export interface SoloStorePayload {
  readonly entries: ReadonlyArray<SoloStoreEntry>;
  readonly lockedCells: ReadonlyArray<SoloStoreLock>;
  readonly hintsUsed: number;
  // Total seconds spent on the puzzle; monotonic across devices (merge takes max).
  readonly elapsedSeconds: number;
}

export const EMPTY_PAYLOAD: SoloStorePayload = {
  entries: [],
  lockedCells: [],
  hintsUsed: 0,
  elapsedSeconds: 0,
};

const cellKey = (r: number, c: number): string => `${r},${c}`;

// Narrows an opaque server payload to SoloStorePayload; drops malformed members rather than throwing.
export function coerceSoloStorePayload(raw: unknown): SoloStorePayload {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_PAYLOAD;
  const obj = raw as Record<string, unknown>;
  const entries = Array.isArray(obj.entries)
    ? obj.entries.filter(
        (e): e is SoloStoreEntry =>
          e != null &&
          typeof e === 'object' &&
          typeof (e as SoloStoreEntry).r === 'number' &&
          typeof (e as SoloStoreEntry).c === 'number' &&
          typeof (e as SoloStoreEntry).l === 'string' &&
          (e as SoloStoreEntry).l.length > 0,
      )
    : [];
  const lockedCells = Array.isArray(obj.lockedCells)
    ? obj.lockedCells.filter(
        (e): e is SoloStoreLock =>
          e != null &&
          typeof e === 'object' &&
          typeof (e as SoloStoreLock).r === 'number' &&
          typeof (e as SoloStoreLock).c === 'number',
      )
    : [];
  const hintsUsed =
    typeof obj.hintsUsed === 'number' && obj.hintsUsed >= 0 ? obj.hintsUsed : 0;
  const elapsedSeconds =
    typeof obj.elapsedSeconds === 'number' &&
    Number.isFinite(obj.elapsedSeconds) &&
    obj.elapsedSeconds >= 0
      ? obj.elapsedSeconds
      : 0;
  return { entries, lockedCells, hintsUsed, elapsedSeconds };
}

// Order-independent semantic equality — lets the sync layer skip a no-op push.
export function payloadsEqual(a: SoloStorePayload, b: SoloStorePayload): boolean {
  if (a.hintsUsed !== b.hintsUsed || a.elapsedSeconds !== b.elapsedSeconds) return false;
  if (a.entries.length !== b.entries.length || a.lockedCells.length !== b.lockedCells.length) {
    return false;
  }
  const letters = new Map<string, string>();
  for (const e of a.entries) letters.set(cellKey(e.r, e.c), e.l);
  for (const e of b.entries) {
    if (letters.get(cellKey(e.r, e.c)) !== e.l) return false;
  }
  const locks = new Set<string>();
  for (const lock of a.lockedCells) locks.add(cellKey(lock.r, lock.c));
  for (const lock of b.lockedCells) {
    if (!locks.has(cellKey(lock.r, lock.c))) return false;
  }
  return true;
}

export { cellKey };
