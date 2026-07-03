import { describe, expect, it } from 'vitest';
import type { DailySummariesPage, DailySummary, PuzzleRepository } from '@/application';
import { fetchAllDailySummaries } from '@/application';

function summary(date: string): DailySummary {
  return { id: date, date, gridNumber: 1, difficulty: null, totalLetterCells: 10 };
}

function pagedRepo(
  pages: DailySummariesPage[],
  calls: Array<{ from?: string; to?: string }>,
): PuzzleRepository {
  return {
    fetchById: () => Promise.reject(new Error('unused')),
    fetchDaily: () => Promise.resolve(null),
    listDailySummaries: (opts) => {
      calls.push({ from: opts?.from, to: opts?.to });
      return Promise.resolve(pages[calls.length - 1]);
    },
  };
}

describe('fetchAllDailySummaries', () => {
  it('follows hasMore pages with an explicit far-past from (the server defaults from to a 31-day window)', async () => {
    const calls: Array<{ from?: string; to?: string }> = [];
    const repo = pagedRepo(
      [
        { items: [summary('2026-07-03'), summary('2026-07-02')], hasMore: true },
        { items: [summary('2026-07-01')], hasMore: false },
      ],
      calls,
    );
    const all = await fetchAllDailySummaries(repo, '2026-07-03');
    expect(all.map((s) => s.date)).toEqual(['2026-07-03', '2026-07-02', '2026-07-01']);
    // from is pinned before the launch anchor so the server clamps it and reports hasMore against the whole archive.
    expect(calls).toEqual([
      { from: '2000-01-01', to: '2026-07-03' },
      { from: '2000-01-01', to: '2026-07-01' },
    ]);
  });

  it('stops on an empty page even if hasMore lies', async () => {
    const calls: Array<{ from?: string; to?: string }> = [];
    const repo = pagedRepo([{ items: [], hasMore: true }], calls);
    expect(await fetchAllDailySummaries(repo, '2026-07-03')).toEqual([]);
    expect(calls).toEqual([{ from: '2000-01-01', to: '2026-07-03' }]);
  });
});
