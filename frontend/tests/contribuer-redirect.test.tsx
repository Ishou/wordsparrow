import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NOINDEX_PRERENDER_ROUTES } from '@/ui/seo';

// asserts /sondage → /contribuer 308s in public/_redirects (ADR-0004)
const REDIRECTS = readFileSync(
  resolve(__dirname, '../public/_redirects'),
  'utf8',
);

function ruleFor(source: string): { target: string; status: string } | null {
  for (const line of REDIRECTS.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const [from, to, status] = trimmed.split(/\s+/);
    if (from === source) return { target: to!, status: status! };
  }
  return null;
}

describe('legacy sondage redirects (_redirects)', () => {
  it('redirects /sondage to /contribuer with 308', () => {
    expect(ruleFor('/sondage')).toEqual({ target: '/contribuer', status: '308' });
  });

  it('redirects /sondage/pairs to /contribuer/pairs with 308', () => {
    expect(ruleFor('/sondage/pairs')).toEqual({
      target: '/contribuer/pairs',
      status: '308',
    });
  });

  it('redirects the trailing-slash forms to the canonical /contribuer targets', () => {
    expect(ruleFor('/sondage/')).toEqual({ target: '/contribuer', status: '308' });
    expect(ruleFor('/sondage/pairs/')).toEqual({
      target: '/contribuer/pairs',
      status: '308',
    });
  });

  it('orders /sondage/pairs before /sondage so the more specific rule wins', () => {
    const lines = REDIRECTS.split('\n').map((l) => l.trim());
    const pairsIdx = lines.findIndex((l) => l.startsWith('/sondage/pairs '));
    const bareIdx = lines.findIndex((l) => l.startsWith('/sondage '));
    expect(pairsIdx).toBeGreaterThanOrEqual(0);
    expect(bareIdx).toBeGreaterThanOrEqual(0);
    expect(pairsIdx).toBeLessThan(bareIdx);
  });
});

describe('prerendered-shell coherence (_redirects)', () => {
  // A prerendered route with a `/ 200` rewrite serves the home shell on hard load → home flash.
  it.each(NOINDEX_PRERENDER_ROUTES)('does NOT rewrite $path to the home shell', (route) => {
    expect(ruleFor(route.path)).not.toEqual({ target: '/', status: '200' });
    expect(ruleFor(`${route.path}/`)).not.toEqual({ target: '/', status: '200' });
  });

  it.each(NOINDEX_PRERENDER_ROUTES)('redirects the trailing-slash form of $path to the bare route', (route) => {
    expect(ruleFor(`${route.path}/`)).toEqual({ target: route.path, status: '308' });
  });

  // lobby/join are dynamic param routes; their rewrite must target the prerendered loading shells — / is the prerendered homepage and flashes it.
  it('rewrites dynamic lobby/join routes to their prerendered shells', () => {
    expect(ruleFor('/lobby/*')).toEqual({ target: '/lobby-shell', status: '200' });
    expect(ruleFor('/join/*')).toEqual({ target: '/join-shell', status: '200' });
  });
});
