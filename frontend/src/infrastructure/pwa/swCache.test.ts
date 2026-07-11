import { describe, expect, it } from 'vitest';
import { buildNavigateFallbackDenylist, dailyScopedCacheKey, isStorablePuzzleResponse, utcDayStamp } from './swCache';

const API = 'https://api.wordsparrow.io';

describe('utcDayStamp', () => {
  it('formats the UTC calendar day as YYYY-MM-DD', () => {
    expect(utcDayStamp(new Date('2026-07-11T09:30:00Z'))).toBe('2026-07-11');
  });

  it('rolls at UTC midnight, not local midnight', () => {
    // 2026-07-11T23:30-02:00 is 2026-07-12T01:30Z — a new UTC day.
    expect(utcDayStamp(new Date('2026-07-11T23:30:00-02:00'))).toBe('2026-07-12');
  });
});

describe('dailyScopedCacheKey', () => {
  it('scopes the date-less "today" daily to the UTC day', () => {
    const key = dailyScopedCacheKey(`${API}/v1/puzzles/daily`, new Date('2026-07-11T09:00:00Z'));
    expect(key).toBe(`${API}/v1/puzzles/daily?day=2026-07-11`);
  });

  it('gives a different key once the UTC day rolls over', () => {
    const d1 = dailyScopedCacheKey(`${API}/v1/puzzles/daily`, new Date('2026-07-11T09:00:00Z'));
    const d2 = dailyScopedCacheKey(`${API}/v1/puzzles/daily`, new Date('2026-07-12T09:00:00Z'));
    expect(d1).not.toBe(d2);
  });

  it('is stable within the same UTC day', () => {
    const morning = dailyScopedCacheKey(`${API}/v1/puzzles/daily`, new Date('2026-07-11T06:00:00Z'));
    const evening = dailyScopedCacheKey(`${API}/v1/puzzles/daily`, new Date('2026-07-11T22:00:00Z'));
    expect(morning).toBe(evening);
  });

  it('leaves an explicit ?date= archive request untouched (already day-distinct)', () => {
    const url = `${API}/v1/puzzles/daily?date=2026-07-01`;
    expect(dailyScopedCacheKey(url, new Date('2026-07-11T09:00:00Z'))).toBe(url);
  });

  it('leaves a by-id puzzle request untouched (immutable per id)', () => {
    const url = `${API}/v1/puzzles/0190a0b1-c2d3-7e4f-8a9b-0c1d2e3f4a5b`;
    expect(dailyScopedCacheKey(url, new Date('2026-07-11T09:00:00Z'))).toBe(url);
  });
});

describe('isStorablePuzzleResponse', () => {
  it('stores the anonymous daily (public, revalidate)', () => {
    expect(isStorablePuzzleResponse(200, 'public, max-age=0, must-revalidate, s-maxage=50400')).toBe(true);
  });

  it('refuses the cookied daily (private, no-store) so per-user hint budgets are never shared', () => {
    expect(isStorablePuzzleResponse(200, 'private, no-store')).toBe(false);
  });

  it('stores an opaque cross-origin response (status 0)', () => {
    expect(isStorablePuzzleResponse(0, null)).toBe(true);
  });

  it('stores a 200 with no Cache-Control header', () => {
    expect(isStorablePuzzleResponse(200, null)).toBe(true);
  });

  it('refuses non-cacheable statuses (e.g. 404 worker-not-ready)', () => {
    expect(isStorablePuzzleResponse(404, 'public, no-cache')).toBe(false);
  });
});

describe('buildNavigateFallbackDenylist', () => {
  const denylist = buildNavigateFallbackDenylist(['/play', '/grilles']);
  const excludes = (path: string) => denylist.some((re) => re.test(path));

  it('excludes a prerendered route', () => {
    expect(excludes('/play')).toBe(true);
  });

  it('excludes a prerendered route carrying a query string (e.g. /play?date=…)', () => {
    expect(excludes('/play?date=2026-06-29')).toBe(true);
  });

  it('excludes the grid API', () => {
    expect(excludes('/v1/puzzles/daily')).toBe(true);
  });

  it('excludes robots.txt and sitemap.xml', () => {
    expect(excludes('/robots.txt')).toBe(true);
    expect(excludes('/sitemap.xml')).toBe(true);
  });

  it('excludes concrete lobby/join URLs so Pages serves their shells', () => {
    expect(excludes('/lobby/7Hk2pQrS')).toBe(true);
    expect(excludes('/join/A2B3C4')).toBe(true);
  });

  it('does not exclude a route absent from the prerendered path list', () => {
    expect(excludes('/aide')).toBe(false);
  });

  it('does not exclude an unrelated path', () => {
    expect(excludes('/foo')).toBe(false);
  });
});
