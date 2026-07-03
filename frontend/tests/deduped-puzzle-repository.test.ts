import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PuzzleRepository } from '@/application';
import type { Puzzle } from '@/domain';
import { createDedupedPuzzleRepository } from '@/infrastructure/api/grid/DedupedPuzzleRepository';

const puzzleWithId = (id: string): Puzzle => ({
  id, title: 'test', language: 'fr', width: 1, height: 1, hintsAllowed: 3, hintsRemaining: 3,
  cells: [{ kind: 'letter', position: { row: 0, col: 0 }, entry: '' }],
});

interface FakeInner {
  readonly repo: PuzzleRepository;
  readonly fetchDailyCalls: Array<string | undefined>;
  failNext(error: Error): void;
}

const createFakeInner = (): FakeInner => {
  const fetchDailyCalls: Array<string | undefined> = [];
  let nextError: Error | null = null;
  let serial = 0;
  const repo: PuzzleRepository = {
    fetchById: (puzzleId) => Promise.resolve(puzzleWithId(puzzleId)),
    fetchDaily: (date) => {
      fetchDailyCalls.push(date);
      if (nextError) {
        const error = nextError;
        nextError = null;
        return Promise.reject(error);
      }
      serial += 1;
      return Promise.resolve(puzzleWithId(`daily-${date ?? 'today'}-${serial}`));
    },
    listDailySummaries: () => Promise.resolve({ items: [], hasMore: false }),
  };
  return { repo, fetchDailyCalls, failNext: (error) => { nextError = error; } };
};

describe('createDedupedPuzzleRepository', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shares a single inner call across concurrent and repeated fetchDaily within the TTL', async () => {
    const inner = createFakeInner();
    const deduped = createDedupedPuzzleRepository(inner.repo);

    const [first, second] = await Promise.all([deduped.fetchDaily(), deduped.fetchDaily()]);
    const third = await deduped.fetchDaily();

    expect(inner.fetchDailyCalls).toHaveLength(1);
    expect(first).toBe(second);
    expect(first).toBe(third);
  });

  it('caches per normalized date key, with undefined normalized separately from explicit dates', async () => {
    const inner = createFakeInner();
    const deduped = createDedupedPuzzleRepository(inner.repo);

    await deduped.fetchDaily();
    await deduped.fetchDaily('2026-07-01');
    await deduped.fetchDaily('2026-07-02');
    await deduped.fetchDaily('2026-07-01');

    expect(inner.fetchDailyCalls).toEqual([undefined, '2026-07-01', '2026-07-02']);
  });

  it('evicts a rejected fetch so the next call retries instead of replaying the failure', async () => {
    const inner = createFakeInner();
    const deduped = createDedupedPuzzleRepository(inner.repo);

    inner.failNext(new Error('boom'));
    await expect(deduped.fetchDaily()).rejects.toThrow('boom');

    const recovered = await deduped.fetchDaily();

    expect(inner.fetchDailyCalls).toHaveLength(2);
    expect(recovered?.id).toBe('daily-today-1');
  });

  it('re-fetches after the TTL elapses', async () => {
    const inner = createFakeInner();
    const deduped = createDedupedPuzzleRepository(inner.repo, 60_000);

    const first = await deduped.fetchDaily();
    vi.advanceTimersByTime(59_999);
    const withinTtl = await deduped.fetchDaily();
    vi.advanceTimersByTime(2);
    const afterTtl = await deduped.fetchDaily();

    expect(withinTtl).toBe(first);
    expect(afterTtl).not.toBe(first);
    expect(inner.fetchDailyCalls).toHaveLength(2);
  });

  it('delegates fetchById and listDailySummaries to the inner repository untouched', async () => {
    const inner = createFakeInner();
    const deduped = createDedupedPuzzleRepository(inner.repo);

    const byId = await deduped.fetchById('abc');
    const page = await deduped.listDailySummaries({ from: '2026-07-01' });

    expect(byId.id).toBe('abc');
    expect(page).toEqual({ items: [], hasMore: false });
  });
});
