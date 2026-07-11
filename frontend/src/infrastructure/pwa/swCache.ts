// Pure helpers for the offline service worker's grid-API runtime cache (ADR-0026, ADR-0089).
// Kept DOM/WebWorker-agnostic so they type-check in both the app and the SW project, and are unit-testable.

const DAILY_PATH = '/v1/puzzles/daily';

export function utcDayStamp(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// The "today" daily is requested date-lessly (ADR-0089 §3, so Cloudflare edge-caches one URL); scope the SW cache key to
// the UTC day so a rollover is a guaranteed miss instead of replaying the previous day's grid until a hard refresh.
export function dailyScopedCacheKey(requestUrl: string, now: Date): string {
  const url = new URL(requestUrl);
  if (url.pathname === DAILY_PATH && !url.searchParams.has('date')) {
    url.searchParams.set('day', utcDayStamp(now));
  }
  return url.href;
}

// Never persist a response the origin marked no-store: the cookied daily embeds a per-user hint budget (ADR-0089 §3).
export function isStorablePuzzleResponse(status: number, cacheControl: string | null): boolean {
  if (status !== 0 && status !== 200) return false;
  return !(cacheControl != null && /\bno-store\b/i.test(cacheControl));
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Prerendered routes (ADR-0053) plus API/asset paths must skip the SPA-shell navigation fallback; `(\?.*)?` keeps
// query-string URLs (e.g. /play?date=…) denied. Kept here, not inlined in sw.ts, so it's unit-testable against source.
export function buildNavigateFallbackDenylist(prerenderedRoutePaths: string[]): RegExp[] {
  return [
    /^\/v1\//,
    /^\/robots\.txt$/,
    /^\/sitemap\.xml$/,
    /^\/third-party-licenses\.txt$/,
    ...prerenderedRoutePaths.map((p) => new RegExp(`^${escapeRegExp(p)}/?(\\?.*)?$`)),
    /^\/lobby\//,
    /^\/join\//,
  ];
}
