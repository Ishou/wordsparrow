import type { PuzzleRepository } from '@/application';
import type { Puzzle } from '@/domain';

interface CacheEntry {
  readonly promise: Promise<Puzzle | null>;
  readonly expiresAt: number;
}

// Decorator sharing in-flight/recent fetchDaily promises so the boot-time prime and the route loaders issue one request (ADR-0089).
export function createDedupedPuzzleRepository(
  inner: PuzzleRepository,
  ttlMs = 60_000,
): PuzzleRepository {
  const cache = new Map<string, CacheEntry>();
  return {
    fetchById: (puzzleId) => inner.fetchById(puzzleId),
    fetchDaily(date?: string): Promise<Puzzle | null> {
      const key = date ?? 'today';
      const cached = cache.get(key);
      if (cached && cached.expiresAt > Date.now()) return cached.promise;
      const promise = inner.fetchDaily(date);
      cache.set(key, { promise, expiresAt: Date.now() + ttlMs });
      promise.catch(() => {
        // Never cache failures; identity check keeps a newer entry intact.
        if (cache.get(key)?.promise === promise) cache.delete(key);
      });
      return promise;
    },
    listDailySummaries: (opts) => inner.listDailySummaries(opts),
  };
}
