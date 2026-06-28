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
    });
  });

  it('round-trips a full blob through replace + load', async () => {
    const { replaceSoloPayload, loadSoloPayload } = await loadFresh();
    const blob = {
      entries: [{ r: 0, c: 0, l: 'A' }],
      lockedCells: [{ r: 1, c: 1 }],
      hintsUsed: 2,
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
    });
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
    replaceSoloPayload(SESSION, PUZZLE_A, { entries: [], lockedCells: [], hintsUsed: 0 });
    expect(listSoloPuzzleIds(SESSION)).toEqual([]);
  });
});
