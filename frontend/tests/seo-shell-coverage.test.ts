import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAppRouter } from '@/ui/router';
import type { AppRouterContext } from '@/ui/routes/__root';
import {
  INDEXABLE_ROUTES,
  NOINDEX_PRERENDER_ROUTES,
  PARAM_SHELL_ROUTES,
} from '@/ui/seo';

// Cold-load shell coverage (ADR-0053): every registered route must be served
// its own HTML on a hard load — a prerendered file, a rewrite to a prerendered
// shell, or an explicit exemption below. dist/index.html is the prerendered
// HOMEPAGE, so any route that falls back to it flashes the home screen.

// redirects.tsx: the router navigates away on mount; landing HTML is irrelevant.
const CLIENT_REDIRECT_PATHS = new Set(['/accueil', '/grille', '/menu', '/privacy']);
// Registered only under import.meta.env.DEV (router.ts) — never served in prod.
const DEV_ONLY_PATHS = new Set(['/design-system', '/lockup']);

function registeredPaths(): ReadonlyArray<string> {
  const router = createAppRouter({ context: {} as AppRouterContext, multiplayer: true });
  const paths = Object.values(router.routesById as Record<string, { fullPath?: string }>)
    .map((r) => r.fullPath)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .map((p) => (p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p));
  return [...new Set(paths)];
}

describe('cold-load shell coverage registry', () => {
  it('covers every registered route', () => {
    const covered = (p: string): boolean =>
      INDEXABLE_ROUTES.some((r) => r.path === p) ||
      NOINDEX_PRERENDER_ROUTES.some((r) => r.path === p) ||
      PARAM_SHELL_ROUTES.some((r) => r.routePath === p) ||
      CLIENT_REDIRECT_PATHS.has(p) ||
      DEV_ONLY_PATHS.has(p);
    const uncovered = registeredPaths().filter((p) => !covered(p));
    expect(uncovered, `routes without cold-load shell coverage: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('prerenders a shell for every param route and no stale ones', () => {
    const paramPaths = registeredPaths().filter((p) => p.includes('$'));
    expect(PARAM_SHELL_ROUTES.map((r) => r.routePath).sort()).toEqual(paramPaths.sort());
  });
});

describe('_redirects shell targets', () => {
  const redirects = readFileSync(resolve(__dirname, '../public/_redirects'), 'utf8');

  it('rewrites /lobby/* and /join/* to their prerendered shells, never to /', () => {
    expect(redirects).toMatch(/^\/lobby\/\*\s+\/lobby-shell\s+200$/m);
    expect(redirects).toMatch(/^\/join\/\*\s+\/join-shell\s+200$/m);
    expect(redirects).not.toMatch(/^\/(lobby|join)\/\*\s+\/\s+200$/m);
  });

  it('308s the trailing-slash form of every prerendered noindex route', () => {
    for (const route of NOINDEX_PRERENDER_ROUTES) {
      const p = route.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(redirects, `missing trailing-slash 308 for ${route.path}`).toMatch(
        new RegExp(`^${p}/\\s+${p}\\s+308$`, 'm'),
      );
    }
  });
});
