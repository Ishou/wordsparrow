// The opaque per-puzzle blob synced to identity (ADR-0075). Mirrors the
// localStorage `StoredPuzzle` shape verbatim — identity stores it without parsing.

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
}

export const EMPTY_PAYLOAD: SoloStorePayload = {
  entries: [],
  lockedCells: [],
  hintsUsed: 0,
};

const cellKey = (r: number, c: number): string => `${r},${c}`;

// Narrows the opaque server `payload` ({ [k]: unknown }) to a SoloStorePayload,
// dropping malformed members rather than throwing — a corrupt remote blob
// degrades to whatever is well-formed, never crashes the sync.
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
  return { entries, lockedCells, hintsUsed };
}

export { cellKey };
