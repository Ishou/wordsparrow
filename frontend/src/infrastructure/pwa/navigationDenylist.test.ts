import { describe, it, expect } from 'vitest';
import { INDEXABLE_ROUTES, NOINDEX_PRERENDER_ROUTES } from '@/ui/seo';
import { navigateFallbackDenylist } from './navigationDenylist';

// Every prerendered route (+ its query form + the param shells) must be denied by the SW navigation fallback or a returning user gets the home shell; derived from the seo route source so a new prerendered route that isn't denylisted fails here.
const PRERENDERED = [
  ...INDEXABLE_ROUTES.map((r) => r.path).filter((p) => p !== '/'),
  ...NOINDEX_PRERENDER_ROUTES.map((r) => r.path),
  '/lobby/7Hk2pQrS',
  '/join/A2B3C4',
];
const PRERENDERED_WITH_QUERY = PRERENDERED.flatMap((p) => [p, `${p}?date=2026-06-29`]);

const isDenied = (path: string): boolean => navigateFallbackDenylist.some((re) => re.test(path));

describe('SW navigation-fallback denylist', () => {
  it.each(PRERENDERED_WITH_QUERY)('denies %s so it reaches the network', (path) => {
    expect(isDenied(path)).toBe(true);
  });

  it('does not deny the SPA home route', () => {
    expect(isDenied('/')).toBe(false);
  });

  it('does not deny an arbitrary client-only route (it must fall back to the SPA shell)', () => {
    expect(isDenied('/some-client-only-view')).toBe(false);
  });
});
