import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXCLUDED_ROUTES, INDEXABLE_ROUTES, PARAM_SHELL_ROUTES } from '@/ui/seo';

const ROUTES_DIR = join(__dirname, '..', 'src', 'ui', 'routes');

interface ScannedRoute {
  readonly file: string;
  readonly path: string;
  readonly noindex: boolean;
}

// Static scan, scoped per createRoute(...) block (not per file) since one file can export several routes.
function scanRoutes(): ScannedRoute[] {
  const out: ScannedRoute[] = [];
  for (const name of readdirSync(ROUTES_DIR)) {
    if (!name.endsWith('.tsx') || name.includes('.lazy.')) continue;
    const src = readFileSync(join(ROUTES_DIR, name), 'utf8');
    for (const block of src.split(/(?=createRoute\()/)) {
      const pathMatch = block.match(/^\s*path: '([^']+)',/m);
      if (!pathMatch) continue;
      const raw = pathMatch[1];
      const path = raw.startsWith('/') ? raw : `/${raw}`;
      const noindex = block.includes('noindexHead(') || /noindex:\s*true/.test(block);
      out.push({ file: name, path, noindex });
    }
  }
  return out;
}

describe('noindex ⇔ manifest drift', () => {
  const scanned = scanRoutes();

  it('scans a plausible route surface (guard against a silent regex miss)', () => {
    expect(scanned.length).toBeGreaterThanOrEqual(15);
    expect(scanned.some((r) => r.path === '/grilles')).toBe(true);
    expect(scanned.filter((r) => r.noindex).length).toBeGreaterThanOrEqual(8);
  });

  it('every route emitting a noindex head is listed in EXCLUDED_ROUTES', () => {
    const missing = scanned
      .filter((r) => r.noindex)
      // param-shell paths appear in the manifest under their TanStack pattern
      .filter((r) => !EXCLUDED_ROUTES.includes(r.path))
      .map((r) => `${r.path} (${r.file})`);
    expect(missing).toEqual([]);
  });

  it('no indexable route is simultaneously excluded', () => {
    const overlap = INDEXABLE_ROUTES.map((r) => r.path).filter((p) => EXCLUDED_ROUTES.includes(p));
    expect(overlap).toEqual([]);
  });

  it('no indexable route emits a noindex head', () => {
    const indexablePaths = new Set(INDEXABLE_ROUTES.map((r) => r.path));
    const contradictions = scanned.filter((r) => r.noindex && indexablePaths.has(r.path));
    expect(contradictions).toEqual([]);
  });

  it('robots.txt disallows exactly the param-space routes and the dropped /privacy alias', () => {
    const robots = readFileSync(join(__dirname, '..', 'public', 'robots.txt'), 'utf8');
    for (const shell of PARAM_SHELL_ROUTES) {
      const prefix = `/${shell.routePath.split('/')[1]}/`;
      expect(robots).toContain(`Disallow: ${prefix}`);
    }
    expect(robots).toContain('Disallow: /privacy');
    // noindex pages must stay crawlable or the noindex meta is never seen.
    const disallowed = [...robots.matchAll(/^Disallow: (.+)$/gm)].map((m) => m[1].trim());
    expect(disallowed.sort()).toEqual(['/join/', '/lobby/', '/privacy']);
  });
});
