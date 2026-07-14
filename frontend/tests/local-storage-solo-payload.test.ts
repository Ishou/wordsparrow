import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SoloModule = typeof import('@/infrastructure/session/localStorageSolo');

async function loadFresh(): Promise<SoloModule> {
  vi.resetModules();
  return await import('@/infrastructure/session/localStorageSolo');
}

const SESSION = '01234567-89ab-7000-8000-000000000000';
const PUZZLE_A = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';
const PUZZLE_B = '0190e3a4-7a2c-7c9e-8f1a-aaaaaaaaaaaa';

describe('localStorageSolo blob accessors (ADR-0075 sync)', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('loadSoloPayload returns an empty payload when nothing is stored', async () => {
    const { loadSoloPayload } = await loadFresh();
    expect(loadSoloPayload(SESSION, PUZZLE_A)).toEqual({
      entries: [],
      lockedCells: [],
      hintsUsed: 0,
      elapsedSeconds: 0,
    });
  });

  it('round-trips a full blob through replace + load', async () => {
    const { replaceSoloPayload, loadSoloPayload } = await loadFresh();
    const blob = {
      entries: [{ r: 0, c: 0, l: 'A' }],
      lockedCells: [{ r: 1, c: 1 }],
      hintsUsed: 2,
      elapsedSeconds: 137,
    };
    replaceSoloPayload(SESSION, PUZZLE_A, blob);
    expect(loadSoloPayload(SESSION, PUZZLE_A)).toEqual(blob);
  });

  it('reads a blob written by the cell-level helpers', async () => {
    const { saveSoloLetter, saveSoloLockedCell, recordSoloHintUsed, loadSoloPayload } =
      await loadFresh();
    saveSoloLetter(SESSION, PUZZLE_A, 2, 3, 'Z');
    saveSoloLockedCell(SESSION, PUZZLE_A, 2, 3);
    recordSoloHintUsed(SESSION, PUZZLE_A);
    expect(loadSoloPayload(SESSION, PUZZLE_A)).toEqual({
      entries: [{ r: 2, c: 3, l: 'Z' }],
      lockedCells: [{ r: 2, c: 3 }],
      hintsUsed: 1,
      elapsedSeconds: 0,
    });
  });

  it('round-trips elapsed seconds and survives other cell writes', async () => {
    const { saveSoloElapsed, loadSoloElapsed, saveSoloLetter, loadSoloPayload } =
      await loadFresh();
    saveSoloElapsed(SESSION, PUZZLE_A, 95);
    expect(loadSoloElapsed(SESSION, PUZZLE_A)).toBe(95);
    // A subsequent letter write must not drop the persisted elapsed time.
    saveSoloLetter(SESSION, PUZZLE_A, 0, 0, 'A');
    expect(loadSoloPayload(SESSION, PUZZLE_A).elapsedSeconds).toBe(95);
  });

  it('persists elapsed time even when no letters are stored yet', async () => {
    const { saveSoloElapsed, listSoloPuzzleIds, loadSoloElapsed } = await loadFresh();
    saveSoloElapsed(SESSION, PUZZLE_A, 12);
    expect(listSoloPuzzleIds(SESSION)).toEqual([PUZZLE_A]);
    expect(loadSoloElapsed(SESSION, PUZZLE_A)).toBe(12);
  });

  it('coerces malformed stored elapsed to 0', async () => {
    const { loadSoloElapsed } = await loadFresh();
    window.localStorage.setItem(
      `bliss.solo.entries.${SESSION}`,
      JSON.stringify({ [PUZZLE_A]: { entries: [], elapsedSeconds: -5 } }),
    );
    expect(loadSoloElapsed(SESSION, PUZZLE_A)).toBe(0);
  });

  it('listSoloPuzzleIds enumerates puzzles with stored progress', async () => {
    const { saveSoloLetter, listSoloPuzzleIds } = await loadFresh();
    saveSoloLetter(SESSION, PUZZLE_A, 0, 0, 'A');
    saveSoloLetter(SESSION, PUZZLE_B, 0, 0, 'B');
    expect(listSoloPuzzleIds(SESSION).sort()).toEqual([PUZZLE_A, PUZZLE_B].sort());
  });

  it('clears the bucket when an empty payload is written', async () => {
    const { saveSoloLetter, replaceSoloPayload, listSoloPuzzleIds } = await loadFresh();
    saveSoloLetter(SESSION, PUZZLE_A, 0, 0, 'A');
    replaceSoloPayload(SESSION, PUZZLE_A, {
      entries: [],
      lockedCells: [],
      hintsUsed: 0,
      elapsedSeconds: 0,
    });
    expect(listSoloPuzzleIds(SESSION)).toEqual([]);
  });
});

describe('localStorageSolo local-edit clock (ADR-0075 §4 collision resolution)', () => {
  const T_LETTER = '2026-06-28T10:00:00.000Z';
  const T_LATER = '2026-06-28T12:00:00.000Z';

  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('is undefined when the puzzle has never been mutated locally', async () => {
    const { loadSoloLocalUpdatedAt } = await loadFresh();
    expect(loadSoloLocalUpdatedAt(SESSION, PUZZLE_A)).toBeUndefined();
  });

  it('is undefined for a legacy bucket that predates the field', async () => {
    const { loadSoloLocalUpdatedAt } = await loadFresh();
    window.localStorage.setItem(
      `bliss.solo.entries.${SESSION}`,
      JSON.stringify({ [PUZZLE_A]: { entries: [{ r: 0, c: 0, l: 'A' }] } }),
    );
    expect(loadSoloLocalUpdatedAt(SESSION, PUZZLE_A)).toBeUndefined();
  });

  it('a letter write stamps the clock', async () => {
    const { saveSoloLetter, loadSoloLocalUpdatedAt } = await loadFresh();
    vi.setSystemTime(new Date(T_LETTER));
    saveSoloLetter(SESSION, PUZZLE_A, 0, 0, 'P');
    expect(loadSoloLocalUpdatedAt(SESSION, PUZZLE_A)).toBe(T_LETTER);
  });

  it('an elapsed-time write does not advance the clock (elapsed is monotonic, not collision-resolved)', async () => {
    const { saveSoloLetter, saveSoloElapsed, loadSoloLocalUpdatedAt } = await loadFresh();
    vi.setSystemTime(new Date(T_LETTER));
    saveSoloLetter(SESSION, PUZZLE_A, 0, 0, 'P');
    vi.setSystemTime(new Date(T_LATER));
    saveSoloElapsed(SESSION, PUZZLE_A, 42);
    expect(loadSoloLocalUpdatedAt(SESSION, PUZZLE_A)).toBe(T_LETTER);
  });

  it('a hint write does not advance the clock (hintsUsed is max-merged)', async () => {
    const { saveSoloLetter, recordSoloHintUsed, loadSoloLocalUpdatedAt } = await loadFresh();
    vi.setSystemTime(new Date(T_LETTER));
    saveSoloLetter(SESSION, PUZZLE_A, 0, 0, 'P');
    vi.setSystemTime(new Date(T_LATER));
    recordSoloHintUsed(SESSION, PUZZLE_A);
    expect(loadSoloLocalUpdatedAt(SESSION, PUZZLE_A)).toBe(T_LETTER);
  });

  it('a lock write does not advance the clock (a lock always wins its own collision)', async () => {
    const { saveSoloLetter, saveSoloLockedCell, loadSoloLocalUpdatedAt } = await loadFresh();
    vi.setSystemTime(new Date(T_LETTER));
    saveSoloLetter(SESSION, PUZZLE_A, 0, 0, 'P');
    vi.setSystemTime(new Date(T_LATER));
    saveSoloLockedCell(SESSION, PUZZLE_A, 3, 3);
    expect(loadSoloLocalUpdatedAt(SESSION, PUZZLE_A)).toBe(T_LETTER);
  });

  it('replaceSoloPayload preserves the local-edit clock across a merge', async () => {
    const { saveSoloLetter, replaceSoloPayload, loadSoloLocalUpdatedAt } = await loadFresh();
    vi.setSystemTime(new Date(T_LETTER));
    saveSoloLetter(SESSION, PUZZLE_A, 0, 0, 'P');
    vi.setSystemTime(new Date(T_LATER));
    replaceSoloPayload(SESSION, PUZZLE_A, {
      entries: [{ r: 0, c: 0, l: 'P' }],
      lockedCells: [],
      hintsUsed: 0,
      elapsedSeconds: 0,
    });
    expect(loadSoloLocalUpdatedAt(SESSION, PUZZLE_A)).toBe(T_LETTER);
  });

  it('keeps the clock out of the wire payload', async () => {
    const { saveSoloLetter, loadSoloPayload } = await loadFresh();
    vi.setSystemTime(new Date(T_LETTER));
    saveSoloLetter(SESSION, PUZZLE_A, 0, 0, 'P');
    expect(loadSoloPayload(SESSION, PUZZLE_A)).not.toHaveProperty('localUpdatedAt');
  });
});
