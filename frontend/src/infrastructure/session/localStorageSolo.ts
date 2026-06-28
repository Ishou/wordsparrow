// storage failures are non-fatal — every helper degrades to a no-op rather than throw.

import type { SoloEntry, SoloLockedCell } from '@/application/solo/SoloEntriesStore';
import type { SoloStorePayload } from '@/application/progress/SoloStorePayload';

const KEY_PREFIX = 'bliss.solo.entries.';
const LEGACY_KEY = 'bliss.solo.entries';

interface StoredEntry {
  r: number;
  c: number;
  l: string;
}

interface StoredLock {
  r: number;
  c: number;
}

interface StoredPuzzle {
  entries: StoredEntry[];
  lockedCells?: StoredLock[];
  hintsUsed?: number;
}

// Per-puzzle bucket. Legacy shape (PR #242) was `StoredEntry[]` — kept on
// read for transparent migration; on write we always emit the object form.
type StoredPuzzleBucket = StoredEntry[] | StoredPuzzle;
type SoloStore = Record<string, StoredPuzzleBucket>;

const keyFor = (sessionId: string): string => `${KEY_PREFIX}${sessionId}`;

let legacyMigrationAttempted = false;

function migrateLegacyOnce(sessionId: string): void {
  if (legacyMigrationAttempted) return;
  legacyMigrationAttempted = true;
  try {
    const legacy = globalThis.localStorage?.getItem(LEGACY_KEY);
    if (legacy == null) return;
    const targetKey = keyFor(sessionId);
    const existing = globalThis.localStorage?.getItem(targetKey);
    if (existing == null) {
      globalThis.localStorage?.setItem(targetKey, legacy);
    }
    globalThis.localStorage?.removeItem(LEGACY_KEY);
  } catch {
    // best-effort migration
  }
}

function readStore(sessionId: string): SoloStore {
  migrateLegacyOnce(sessionId);
  try {
    const raw = globalThis.localStorage?.getItem(keyFor(sessionId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as SoloStore;
    }
  } catch {
    // localStorage threw or JSON was malformed — treat as empty store.
  }
  return {};
}

function writeStore(sessionId: string, store: SoloStore): void {
  try {
    globalThis.localStorage?.setItem(keyFor(sessionId), JSON.stringify(store));
  } catch {
    // Private mode / quota exhausted / sandboxed: drop silently.
  }
}

function readBucket(store: SoloStore, puzzleId: string): StoredPuzzle {
  const raw = store[puzzleId];
  if (!raw) return { entries: [], lockedCells: [], hintsUsed: 0 };
  if (Array.isArray(raw)) return { entries: raw, lockedCells: [], hintsUsed: 0 };
  return {
    entries: raw.entries ?? [],
    lockedCells: raw.lockedCells ?? [],
    hintsUsed: raw.hintsUsed ?? 0,
  };
}

function persistBucket(
  store: SoloStore,
  puzzleId: string,
  bucket: StoredPuzzle,
): void {
  if (
    bucket.entries.length === 0 &&
    (bucket.lockedCells ?? []).length === 0 &&
    (bucket.hintsUsed ?? 0) === 0
  ) {
    delete store[puzzleId];
  } else {
    store[puzzleId] = bucket;
  }
}

/** Load the persisted entries for a puzzle, or `[]` if none. */
export function loadSoloEntries(sessionId: string, puzzleId: string): SoloEntry[] {
  const store = readStore(sessionId);
  const bucket = readBucket(store, puzzleId);
  return bucket.entries
    .filter((e): e is StoredEntry =>
      typeof e?.r === 'number' &&
      typeof e?.c === 'number' &&
      typeof e?.l === 'string' &&
      e.l.length > 0,
    )
    .map((e) => ({ row: e.r, column: e.c, letter: e.l }));
}

// null or '' for letter removes the entry.
export function saveSoloLetter(
  sessionId: string,
  puzzleId: string,
  row: number,
  column: number,
  letter: string | null,
): void {
  const store = readStore(sessionId);
  const bucket = readBucket(store, puzzleId);
  const next = bucket.entries.filter((e) => !(e.r === row && e.c === column));
  if (letter && letter.length > 0) {
    next.push({ r: row, c: column, l: letter });
  }
  persistBucket(store, puzzleId, {
    entries: next,
    lockedCells: bucket.lockedCells,
    hintsUsed: bucket.hintsUsed,
  });
  writeStore(sessionId, store);
}

/** Load the locked-cell coordinates for a puzzle, or `[]` if none. */
export function loadSoloLockedCells(
  sessionId: string,
  puzzleId: string,
): SoloLockedCell[] {
  const store = readStore(sessionId);
  const bucket = readBucket(store, puzzleId);
  return (bucket.lockedCells ?? [])
    .filter(
      (e): e is StoredLock => typeof e?.r === 'number' && typeof e?.c === 'number',
    )
    .map((e) => ({ row: e.r, column: e.c }));
}

export function saveSoloLockedCell(
  sessionId: string,
  puzzleId: string,
  row: number,
  column: number,
): void {
  const store = readStore(sessionId);
  const bucket = readBucket(store, puzzleId);
  const existing = bucket.lockedCells ?? [];
  if (existing.some((e) => e.r === row && e.c === column)) return;
  persistBucket(store, puzzleId, {
    entries: bucket.entries,
    lockedCells: [...existing, { r: row, c: column }],
    hintsUsed: bucket.hintsUsed,
  });
  writeStore(sessionId, store);
}

export function loadSoloHintsUsed(sessionId: string, puzzleId: string): number {
  const store = readStore(sessionId);
  const bucket = readBucket(store, puzzleId);
  return typeof bucket.hintsUsed === 'number' && bucket.hintsUsed >= 0
    ? bucket.hintsUsed
    : 0;
}

export function recordSoloHintUsed(sessionId: string, puzzleId: string): void {
  const store = readStore(sessionId);
  const bucket = readBucket(store, puzzleId);
  persistBucket(store, puzzleId, {
    entries: bucket.entries,
    lockedCells: bucket.lockedCells,
    hintsUsed: (bucket.hintsUsed ?? 0) + 1,
  });
  writeStore(sessionId, store);
}

export function clearSoloEntriesForPuzzle(
  sessionId: string,
  puzzleId: string,
): void {
  const store = readStore(sessionId);
  if (!(puzzleId in store)) return;
  delete store[puzzleId];
  writeStore(sessionId, store);
}

/** The full blob for one puzzle, normalised — backs the sync layer's merge (ADR-0075). */
export function loadSoloPayload(sessionId: string, puzzleId: string): SoloStorePayload {
  const bucket = readBucket(readStore(sessionId), puzzleId);
  return {
    entries: bucket.entries
      .filter(
        (e): e is StoredEntry =>
          typeof e?.r === 'number' &&
          typeof e?.c === 'number' &&
          typeof e?.l === 'string' &&
          e.l.length > 0,
      )
      .map((e) => ({ r: e.r, c: e.c, l: e.l })),
    lockedCells: (bucket.lockedCells ?? [])
      .filter((e): e is StoredLock => typeof e?.r === 'number' && typeof e?.c === 'number')
      .map((e) => ({ r: e.r, c: e.c })),
    hintsUsed:
      typeof bucket.hintsUsed === 'number' && bucket.hintsUsed >= 0 ? bucket.hintsUsed : 0,
  };
}

/** Replaces one puzzle's blob wholesale after a sync merge (ADR-0075). */
export function replaceSoloPayload(
  sessionId: string,
  puzzleId: string,
  payload: SoloStorePayload,
): void {
  const store = readStore(sessionId);
  persistBucket(store, puzzleId, {
    entries: payload.entries.map((e) => ({ r: e.r, c: e.c, l: e.l })),
    lockedCells: payload.lockedCells.map((e) => ({ r: e.r, c: e.c })),
    hintsUsed: payload.hintsUsed,
  });
  writeStore(sessionId, store);
}

/** Puzzle ids the device currently holds local progress for. */
export function listSoloPuzzleIds(sessionId: string): string[] {
  return Object.keys(readStore(sessionId));
}

/** Defensive sweep used by RGPD Art. 17 erase — removes every scoped + legacy key. */
export function clearAllSoloEntriesForEverySession(): void {
  try {
    const ls = globalThis.localStorage;
    if (ls == null) return;
    const toDelete: string[] = [];
    for (let i = 0; i < ls.length; i += 1) {
      const key = ls.key(i);
      if (key != null && key.startsWith(KEY_PREFIX)) toDelete.push(key);
    }
    toDelete.forEach((k) => ls.removeItem(k));
    ls.removeItem(LEGACY_KEY);
  } catch {
    // No-op.
  }
}
