import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  INDEXABLE_ROUTES,
  NOINDEX_PRERENDER_ROUTES,
  PARAM_SHELL_ROUTES,
  SITE_BASE_URL,
} from '@/ui/seo';

const DIST = resolve(__dirname, '../dist');

// This suite asserts the *post-build* state of dist/. It MUST be run
// after `pnpm build`. CI runs it via `pnpm test:post-build` (added in
// Task 11). Running locally without a prior build will fail.
describe.skipIf(!existsSync(resolve(DIST, 'index.html')))(
  'prerender output (post-build)',
  () => {
    it.each(INDEXABLE_ROUTES)('emits prerender HTML for $path', (route) => {
      const expectedPath =
        route.path === '/'
          ? resolve(DIST, 'index.html')
          : resolve(DIST, `${route.path.slice(1)}.html`);
      expect(existsSync(expectedPath)).toBe(true);
    });

    // Noindex routes get their own shell — hard load serves route HTML, not the home shell.
    it.each(NOINDEX_PRERENDER_ROUTES)('emits a noindex shell for $path', (route) => {
      const html = readFileSync(resolve(DIST, `${route.path.slice(1)}.html`), 'utf8');
      expect(html).toContain(`<title>${route.title}</title>`);
      expect(html).toContain('content="noindex,follow"');
    });

    it.each(INDEXABLE_ROUTES)('embeds the route title in dist/$path', (route) => {
      const file =
        route.path === '/'
          ? resolve(DIST, 'index.html')
          : resolve(DIST, `${route.path.slice(1)}.html`);
      const html = readFileSync(file, 'utf8');
      expect(html).toContain(`<title>${route.title}</title>`);
    });

    it.each(INDEXABLE_ROUTES)('embeds the route description in dist/$path', (route) => {
      const file =
        route.path === '/'
          ? resolve(DIST, 'index.html')
          : resolve(DIST, `${route.path.slice(1)}.html`);
      const html = readFileSync(file, 'utf8');
      expect(html).toContain(`content="${route.description}"`);
    });

    it.each(INDEXABLE_ROUTES)('embeds the canonical link in dist/$path', (route) => {
      const file =
        route.path === '/'
          ? resolve(DIST, 'index.html')
          : resolve(DIST, `${route.path.slice(1)}.html`);
      const html = readFileSync(file, 'utf8');
      expect(html).toContain(`href="${SITE_BASE_URL}${route.path}"`);
    });

    it('emits dist/sitemap.xml referencing every indexable route', () => {
      const xml = readFileSync(resolve(DIST, 'sitemap.xml'), 'utf8');
      for (const r of INDEXABLE_ROUTES) {
        expect(xml).toContain(`<loc>${SITE_BASE_URL}${r.path}</loc>`);
      }
    });

    it('does NOT include excluded routes in sitemap.xml', () => {
      const xml = readFileSync(resolve(DIST, 'sitemap.xml'), 'utf8');
      expect(xml).not.toContain('/lobby/');
      expect(xml).not.toContain('/join/');
      expect(xml).not.toContain('/privacy<');
    });

    it('sitemap.xml declares the image namespace', () => {
      const xml = readFileSync(resolve(DIST, 'sitemap.xml'), 'utf8');
      expect(xml).toContain(
        'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"',
      );
    });

    it.each(INDEXABLE_ROUTES)(
      'sitemap.xml carries image entry for $path',
      (route) => {
        const xml = readFileSync(resolve(DIST, 'sitemap.xml'), 'utf8');
        expect(xml).toContain(
          `<image:loc>${SITE_BASE_URL}${route.ogImagePath}</image:loc>`,
        );
      },
    );

    it('emits dist/robots.txt with the production Disallow set', () => {
      const robots = readFileSync(resolve(DIST, 'robots.txt'), 'utf8');
      expect(robots).toContain('Disallow: /lobby/');
      expect(robots).toContain('Disallow: /join/');
      expect(robots).toContain('Disallow: /privacy');
      expect(robots).toContain('Sitemap: https://wordsparrow.io/sitemap.xml');
    });

    // Param routes get one shell each; the _redirects 200-rewrites serve it for every concrete URL.
    it.each(PARAM_SHELL_ROUTES)('emits a param shell for $routePath', (route) => {
      const html = readFileSync(resolve(DIST, `${route.outSlug}.html`), 'utf8');
      expect(html).toContain(`<title>${route.title}</title>`);
      expect(html).toContain('content="noindex,follow"');
    });

    // A shell that carries the home-only JSON-LD is a copy of index.html — the fallback flash is back.
    it.each([...NOINDEX_PRERENDER_ROUTES.map((r) => `${r.path.slice(1)}.html`), ...PARAM_SHELL_ROUTES.map((r) => `${r.outSlug}.html`)])(
      'dist/%s does not carry the homepage body',
      (file) => {
        const html = readFileSync(resolve(DIST, file), 'utf8');
        expect(html).not.toContain('"@type":"WebApplication"');
        expect(html).not.toContain('"@type":"Organization"');
      },
    );

    // SW navigation fallback must exclude every prerendered route or returning users get the home shell.
    const PRERENDERED = [
      ...INDEXABLE_ROUTES.map((r) => r.path).filter((p) => p !== '/'),
      ...NOINDEX_PRERENDER_ROUTES.map((r) => r.path),
      // Concrete param URLs must reach the network so Pages serves the shells.
      '/lobby/7Hk2pQrS',
      '/join/A2B3C4',
    ];
    // A query string (e.g. /play?date=…) must stay denylisted too — else the SW serves the home shell and flashes it.
    const PRERENDERED_WITH_QUERY = PRERENDERED.flatMap((p) => [p, `${p}?date=2026-06-29`]);
    it.each(PRERENDERED_WITH_QUERY)('SW navigation denylist excludes %s', (path) => {
      const sw = readFileSync(resolve(DIST, 'sw.js'), 'utf8');
      const denylist = /createHandlerBoundToURL\("\/index\.html"\),\{denylist:\[([^\]]*)\]/.exec(sw);
      expect(denylist, 'NavigationRoute denylist not found in sw.js').not.toBeNull();
      const matched = denylist![1]
        .split(/,(?=\/)/)
        .some((src) => new RegExp(src.replace(/^\/|\/$/g, '')).test(path));
      expect(matched, `${path} is not in the SW navigation denylist`).toBe(true);
    });

    it('embeds JSON-LD WebApplication on the homepage', () => {
      const html = readFileSync(resolve(DIST, 'index.html'), 'utf8');
      expect(html).toContain('"@type":"WebApplication"');
      expect(html).toContain('"applicationCategory":"GameApplication"');
      expect(html).toContain('"inLanguage":"fr"');
    });

    it('embeds Organization JSON-LD on the homepage', () => {
      const html = readFileSync(resolve(DIST, 'index.html'), 'utf8');
      expect(html).toContain('"@type":"Organization"');
      expect(html).toContain('"name":"WordSparrow"');
      expect(html).toContain('"logo":"https://wordsparrow.io/icon-512.png"');
    });

    it('does NOT embed Organization JSON-LD on non-homepage routes', () => {
      for (const path of ['play', 'aide', 'mentions-legales', 'confidentialite']) {
        const html = readFileSync(resolve(DIST, `${path}.html`), 'utf8');
        expect(html).not.toContain('"@type":"Organization"');
      }
    });

    // ADR-0074: /aide ships its own copy without an exported FAQ Q&A, so it has no FAQPage JSON-LD.

    it.each([
      ['aide', '/aide'],
      ['play', '/play'],
      ['grilles', '/grilles'],
      ['mentions-legales', '/mentions-legales'],
      ['confidentialite', '/confidentialite'],
    ])('embeds BreadcrumbList JSON-LD on /%s', (dir) => {
      const html = readFileSync(resolve(DIST, `${dir}.html`), 'utf8');
      expect(html).toContain('"@type":"BreadcrumbList"');
    });

    it('does NOT embed BreadcrumbList on the homepage (it is the root, not a child)', () => {
      const html = readFileSync(resolve(DIST, 'index.html'), 'utf8');
      expect(html).not.toContain('"@type":"BreadcrumbList"');
    });

    it('embeds Game JSON-LD on /play', () => {
      const html = readFileSync(resolve(DIST, 'play.html'), 'utf8');
      expect(html).toContain('"@type":"Game"');
      expect(html).toContain('"genre":"Word puzzle"');
      expect(html).toContain('"gamePlatform":"Web browser"');
    });

    it('does NOT embed Game JSON-LD on the homepage', () => {
      const html = readFileSync(resolve(DIST, 'index.html'), 'utf8');
      expect(html).not.toContain('"@type":"Game"');
    });

    it.each(INDEXABLE_ROUTES)('emits exactly one <title> in dist/$path', (route) => {
      const file =
        route.path === '/'
          ? resolve(DIST, 'index.html')
          : resolve(DIST, `${route.path.slice(1)}.html`);
      const html = readFileSync(file, 'utf8');
      const titleCount = (html.match(/<title>/g) ?? []).length;
      expect(titleCount).toBe(1);
    });

    it.each(INDEXABLE_ROUTES)('emits exactly one og:image in dist/$path', (route) => {
      const file =
        route.path === '/'
          ? resolve(DIST, 'index.html')
          : resolve(DIST, `${route.path.slice(1)}.html`);
      const html = readFileSync(file, 'utf8');
      const ogImageCount = (html.match(/property="og:image"/g) ?? []).length;
      expect(ogImageCount).toBe(1);
    });

    it.each(INDEXABLE_ROUTES)('emits exactly one canonical link in dist/$path', (route) => {
      const file =
        route.path === '/'
          ? resolve(DIST, 'index.html')
          : resolve(DIST, `${route.path.slice(1)}.html`);
      const html = readFileSync(file, 'utf8');
      const canonicalCount = (html.match(/rel="canonical"/g) ?? []).length;
      expect(canonicalCount).toBe(1);
    });

    it.each(INDEXABLE_ROUTES)(
      'embeds the per-route og:image in dist/$path',
      (route) => {
        const file =
          route.path === '/'
            ? resolve(DIST, 'index.html')
            : resolve(DIST, `${route.path.slice(1)}.html`);
        const html = readFileSync(file, 'utf8');
        const expected = `${SITE_BASE_URL}${route.ogImagePath}`;
        expect(html).toContain(`property="og:image" content="${expected}"`);
        expect(html).toContain(`name="twitter:image" content="${expected}"`);
      },
    );

    // ADR-0074: v2 screens use minimal headers ("Bonjour"/"Aide"), not keyword-targeted H1s.

    // Guard against the "frozen tour on hard refresh" bug. The
    // prerender browser starts with empty localStorage; without the
    // `wordsparrow.tour.seen` seed in `scripts/prerender.ts`,
    // `useSoloTour` auto-opens the welcome step and the Portal-rendered
    // tour parts get baked into `dist/grille.html` as
    // `data-state="open"` markup. Real visitors then load that static
    // HTML and see a tour with no React handlers attached (Portal
    // content is outside the route's hydratable subtree, so the
    // client-side machine never adopts it).
    //
    // Closed-state tour parts (`data-scope="tour"` with `hidden`) still
    // render via the Portal; they are inert and invisible. We only
    // assert the open-state surface is absent.
    it.each(INDEXABLE_ROUTES)(
      'does not bake the open-state solo tour into dist/$path',
      (route) => {
        const file =
          route.path === '/'
            ? resolve(DIST, 'index.html')
            : resolve(DIST, `${route.path.slice(1)}.html`);
        const html = readFileSync(file, 'utf8');
        // Only the open-state portal markup signals the bug. The
        // closed-state Tour.Content (hidden, with the always-rendered
        // dismiss button inside it) is harmless.
        expect(html).not.toMatch(/data-scope="tour"[^>]*data-state="open"/);
        // Welcome-step title only renders into the DOM when the zag
        // machine is active (it's bound through the live step record,
        // not the JSX children).
        expect(html).not.toContain('Bienvenue');
        // `progressText` resolves to "Étape 1 sur N" only when current
        // step is 0 (open at welcome); closed-state shows "Étape 0 sur N".
        expect(html).not.toMatch(/Étape 1 sur \d+/);
      },
    );

    // lazyMount keeps the closed-state Portal out of prerendered HTML; without it duplicate ids break hydration on mobile.
    it.each(INDEXABLE_ROUTES)(
      'does not bake the burger-menu Portal into dist/$path',
      (route) => {
        const file =
          route.path === '/'
            ? resolve(DIST, 'index.html')
            : resolve(DIST, `${route.path.slice(1)}.html`);
        const html = readFileSync(file, 'utf8');
        expect(html).not.toMatch(/data-scope="menu"[^>]*data-part="positioner"/);
        expect(html).not.toMatch(/data-scope="menu"[^>]*data-part="content"/);
      },
    );
  },
);

// File-existence checks for the per-route OG images. These run regardless
// of whether dist/ has been built — they assert the public/ checked-in
// assets, not the post-build output.
describe('per-route OG image assets', () => {
  it.each(INDEXABLE_ROUTES)(
    'public/<og image> exists for $path',
    (route) => {
      const path = resolve(
        __dirname,
        '..',
        'public',
        route.ogImagePath.slice(1),
      );
      expect(existsSync(path)).toBe(true);
    },
  );
});

