import { describe, expect, it } from 'vitest';
import { mergeProgress } from '@/application/progress/mergeProgress';
import { EMPTY_PAYLOAD, type SoloStorePayload } from '@/application/progress/SoloStorePayload';

const T1 = '2026-06-28T10:00:00.000Z';
const T2 = '2026-06-28T11:00:00.000Z';

function payload(p: Partial<SoloStorePayload>): SoloStorePayload {
  return { entries: [], lockedCells: [], hintsUsed: 0, ...p };
}

// Sort by cell key so set-union order is irrelevant to assertions.
function sortedEntries(p: SoloStorePayload) {
  return [...p.entries].sort((a, b) => `${a.r},${a.c}`.localeCompare(`${b.r},${b.c}`));
}
function sortedLocks(p: SoloStorePayload) {
  return [...p.lockedCells].sort((a, b) => `${a.r},${a.c}`.localeCompare(`${b.r},${b.c}`));
}

describe('mergeProgress — filled cells', () => {
  it('unions disjoint cells from both sides', () => {
    const merged = mergeProgress(
      { payload: payload({ entries: [{ r: 0, c: 0, l: 'A' }] }), updatedAt: T1 },
      { payload: payload({ entries: [{ r: 1, c: 1, l: 'B' }] }), updatedAt: T2 },
    );
    expect(sortedEntries(merged)).toEqual([
      { r: 0, c: 0, l: 'A' },
      { r: 1, c: 1, l: 'B' },
    ]);
  });

  it('keeps the newer blob letter on a per-cell collision (remote newer)', () => {
    const merged = mergeProgress(
      { payload: payload({ entries: [{ r: 0, c: 0, l: 'A' }] }), updatedAt: T1 },
      { payload: payload({ entries: [{ r: 0, c: 0, l: 'Z' }] }), updatedAt: T2 },
    );
    expect(merged.entries).toEqual([{ r: 0, c: 0, l: 'Z' }]);
  });

  it('keeps the newer blob letter on a per-cell collision (local newer)', () => {
    const merged = mergeProgress(
      { payload: payload({ entries: [{ r: 0, c: 0, l: 'A' }] }), updatedAt: T2 },
      { payload: payload({ entries: [{ r: 0, c: 0, l: 'Z' }] }), updatedAt: T1 },
    );
    expect(merged.entries).toEqual([{ r: 0, c: 0, l: 'A' }]);
  });

  it('keeps the local-only cell', () => {
    const merged = mergeProgress(
      { payload: payload({ entries: [{ r: 2, c: 3, l: 'L' }] }), updatedAt: T1 },
      { payload: EMPTY_PAYLOAD, updatedAt: T2 },
    );
    expect(merged.entries).toEqual([{ r: 2, c: 3, l: 'L' }]);
  });

  it('keeps the remote-only cell', () => {
    const merged = mergeProgress(
      { payload: EMPTY_PAYLOAD, updatedAt: T2 },
      { payload: payload({ entries: [{ r: 4, c: 5, l: 'R' }] }), updatedAt: T1 },
    );
    expect(merged.entries).toEqual([{ r: 4, c: 5, l: 'R' }]);
  });

  it('treats a missing remote updatedAt as oldest so local wins a collision', () => {
    const merged = mergeProgress(
      { payload: payload({ entries: [{ r: 0, c: 0, l: 'A' }] }), updatedAt: T1 },
      { payload: payload({ entries: [{ r: 0, c: 0, l: 'Z' }] }) },
    );
    expect(merged.entries).toEqual([{ r: 0, c: 0, l: 'A' }]);
  });

  it('treats a missing local updatedAt as oldest so remote wins a collision', () => {
    const merged = mergeProgress(
      { payload: payload({ entries: [{ r: 0, c: 0, l: 'A' }] }) },
      { payload: payload({ entries: [{ r: 0, c: 0, l: 'Z' }] }), updatedAt: T1 },
    );
    expect(merged.entries).toEqual([{ r: 0, c: 0, l: 'Z' }]);
  });
});

describe('mergeProgress — locked cells (monotonic union)', () => {
  it('unions validated cells from both sides without duplicates', () => {
    const merged = mergeProgress(
      {
        payload: payload({ lockedCells: [{ r: 0, c: 0 }, { r: 1, c: 1 }] }),
        updatedAt: T1,
      },
      {
        payload: payload({ lockedCells: [{ r: 1, c: 1 }, { r: 2, c: 2 }] }),
        updatedAt: T2,
      },
    );
    expect(sortedLocks(merged)).toEqual([
      { r: 0, c: 0 },
      { r: 1, c: 1 },
      { r: 2, c: 2 },
    ]);
  });

  it('never un-validates a cell when the newer blob lacks it', () => {
    const merged = mergeProgress(
      { payload: payload({ lockedCells: [{ r: 0, c: 0 }] }), updatedAt: T1 },
      { payload: EMPTY_PAYLOAD, updatedAt: T2 },
    );
    expect(merged.lockedCells).toEqual([{ r: 0, c: 0 }]);
  });
});

describe('mergeProgress — hints used (max)', () => {
  it('takes the max of both sides', () => {
    const merged = mergeProgress(
      { payload: payload({ hintsUsed: 3 }), updatedAt: T2 },
      { payload: payload({ hintsUsed: 5 }), updatedAt: T1 },
    );
    expect(merged.hintsUsed).toBe(5);
  });

  it('is 0 when neither side recorded a hint', () => {
    const merged = mergeProgress(
      { payload: EMPTY_PAYLOAD, updatedAt: T1 },
      { payload: EMPTY_PAYLOAD, updatedAt: T2 },
    );
    expect(merged.hintsUsed).toBe(0);
  });
});

describe('mergeProgress — combined', () => {
  it('merges entries, locks, and hints together', () => {
    const merged = mergeProgress(
      {
        payload: payload({
          entries: [{ r: 0, c: 0, l: 'A' }, { r: 0, c: 1, l: 'B' }],
          lockedCells: [{ r: 0, c: 0 }],
          hintsUsed: 1,
        }),
        updatedAt: T1,
      },
      {
        payload: payload({
          entries: [{ r: 0, c: 1, l: 'X' }, { r: 0, c: 2, l: 'C' }],
          lockedCells: [{ r: 0, c: 2 }],
          hintsUsed: 4,
        }),
        updatedAt: T2,
      },
    );
    expect(sortedEntries(merged)).toEqual([
      { r: 0, c: 0, l: 'A' },
      { r: 0, c: 1, l: 'X' }, // remote newer ⇒ X wins
      { r: 0, c: 2, l: 'C' },
    ]);
    expect(sortedLocks(merged)).toEqual([
      { r: 0, c: 0 },
      { r: 0, c: 2 },
    ]);
    expect(merged.hintsUsed).toBe(4);
  });
});
