import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';
import license from 'rollup-plugin-license';

// Redistribution notice (ADR-0090). rollup-plugin-license only scans JS modules,
// so fonts embedded through CSS url() (Hanken Grotesk, Spline Sans Mono) are invisible
// to it. This file receives the aggregate; the companion plugin below tops it up.
const LICENSE_OUTPUT_FILE = path.resolve(__dirname, 'dist/third-party-licenses.txt');

// Append the OFL notice of every embedded-font package the JS scan missed, keyed off
// each emitted .woff2 asset's source path. General: any CSS-embedded font is covered.
function embeddedFontLicenses(): Plugin {
  return {
    name: 'embedded-font-licenses',
    writeBundle(_options, bundle) {
      if (!existsSync(LICENSE_OUTPUT_FILE)) return;
      const already = readFileSync(LICENSE_OUTPUT_FILE, 'utf8');
      const packageDirs = new Set<string>();
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset') continue;
        const sources = asset.originalFileNames ?? [];
        for (const source of sources) {
          if (!/\.(woff2?|ttf|otf)$/.test(source)) continue;
          let dir = path.dirname(path.resolve(__dirname, source));
          while (dir !== path.dirname(dir)) {
            if (existsSync(path.join(dir, 'package.json'))) {
              packageDirs.add(dir);
              break;
            }
            dir = path.dirname(dir);
          }
        }
      }
      const missing = [...packageDirs]
        .map((dir) => {
          const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
          const licenseFile = ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'OFL.txt'].find((name) =>
            existsSync(path.join(dir, name)),
          );
          return {
            name: pkg.name as string,
            version: pkg.version as string,
            license: (pkg.license as string) ?? 'OFL-1.1',
            dir,
            licenseFile,
          };
        })
        .filter((p) => p.licenseFile != null && !already.includes(`Name: ${p.name}\n`))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (missing.length === 0) return;
      const blocks = missing.map((p) => {
        const text = readFileSync(path.join(p.dir, p.licenseFile as string), 'utf8').trimEnd();
        return `\n---\n\nName: ${p.name}\nVersion: ${p.version}\nLicense: ${p.license}\n\n${text}\n`;
      });
      const header =
        '\n\n===\n\nEmbedded fonts (referenced from CSS, redistributed as .woff2 in this bundle):\n';
      appendFileSync(LICENSE_OUTPUT_FILE, header + blocks.join(''), 'utf8');
    },
  };
}

// Vite + React 19 config for the Bliss frontend bounded context.
// See ADR-0002 for the stack rationale. v2 faces (ADR-0072) ship with font-display: block + a render-gate in main.tsx.

// Prerendered routes are post-Workbox; denylist so navigations hit Cloudflare's per-route HTML — ADR-0053.
const PRERENDERED_ROUTE_PATHS = [
  '/play',
  '/grilles',
  '/aide',
  '/mentions-legales',
  '/confidentialite',
  '/conditions-abonnement',
  '/remerciements',
  '/compte',
  '/reglages',
  '/finish',
  '/abonnement',
  '/abonnement/succes',
  '/abonnement/annule',
  '/contribuer',
  '/contribuer/pairs',
] as const;
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// `(\?.*)?` keeps query-string URLs (e.g. /play?date=…) denylisted; without it the SW serves the home shell and flashes it.
const PRERENDER_NAV_DENYLIST: RegExp[] = [
  ...PRERENDERED_ROUTE_PATHS.map((p) => new RegExp(`^${escapeRegExp(p)}/?(\\?.*)?$`)),
  // Param routes: Pages serves their prerendered loading shells via the _redirects 200-rewrites.
  /^\/lobby\//,
  /^\/join\//,
];

// MSW preview handlers (see ADR-0007 §5) replay the spec's
// `examples/` payloads so the preview SPA stays contract-conformant
// without a live API. The fixtures live in `grid/api/examples/` —
// outside Vite's `root` and outside `frontend/`'s tsconfig include.
// Rather than copy the file or relax `resolveJsonModule`, this
// plugin exposes each example as a virtual ESM module:
//
//   import puzzle from 'virtual:grid-api-examples/get-puzzle-200';
//
// The JSON is read from disk at resolve time, so the spec is the
// single source of truth — no committed copy to drift.
function gridApiExamplesAsVirtualModule(): Plugin {
  const prefix = 'virtual:grid-api-examples/';
  const examplesDir = path.resolve(__dirname, '../grid/api/examples');
  return {
    name: 'grid-api-examples-virtual',
    resolveId(id) {
      if (id.startsWith(prefix)) return '\0' + id;
    },
    load(resolved) {
      if (!resolved.startsWith('\0' + prefix)) return;
      const name = resolved.slice(('\0' + prefix).length);
      const file = path.join(examplesDir, `${name}.json`);
      const json = readFileSync(file, 'utf8');
      return `export default ${json};`;
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    gridApiExamplesAsVirtualModule(),
    // PWA + offline cache. Workbox precaches the app shell so a reload
    // works without network, and applies a NetworkFirst strategy to the
    // grid API so the last-loaded puzzle stays playable offline. The
    // existing `manifest.webmanifest` is the source of truth — we set
    // `manifest: false` so the plugin does not generate a competing one.
    // prompt mode + skipWaiting false: new SW waits for user accept via UpdatePrompt. See ADR-0026.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      filename: 'sw.js',
      manifest: false,
      includeAssets: [
        'favicon.svg',
        'icon-180.png',
        'icon-192.png',
        'icon-512.png',
        'manifest.webmanifest',
      ],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        // Bypass navigateFallback for paths CF Pages serves directly; see ADR-0053, ADR-0026.
        navigateFallbackDenylist: [
          /^\/v1\//,
          /^\/robots\.txt$/,
          /^\/sitemap\.xml$/,
          // Static redistribution notice must reach the network, not the SPA shell.
          /^\/third-party-licenses\.txt$/,
          ...PRERENDER_NAV_DENYLIST,
        ],
        cleanupOutdatedCaches: true,
        // skipWaiting false → new SW waits for user accept; see ADR-0026 update-prompt UX
        skipWaiting: false,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Grid API: serve fresh when online, fall back to cache when
            // offline. 5s network timeout means a flaky link reverts to
            // the cached puzzle quickly. 1-week TTL is well under any
            // realistic puzzle-content rotation.
            urlPattern: ({ url }) =>
              url.hostname === 'api.wordsparrow.io' &&
              url.pathname.startsWith('/v1/puzzles/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'grid-api-puzzles',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 32,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'styled-system': path.resolve(__dirname, './styled-system'),
    },
  },
  build: {
    // Public maps are fine because the repo is public on GitHub
    // (the OCI `org.opencontainers.image.source` label baked into
    // our Dockerfiles confirms it). Map files add zero source
    // disclosure that isn't already at `Ishou/bliss`. ~250 KB per
    // asset on the static host; CDN-cacheable, only fetched on demand.
    //
    // If the repo ever flips private, change `true` → `'hidden'` and
    // add a CI step that uploads the `.map` files to a private bucket;
    // SigNoz still won't auto-unmap, but a developer with the maps in
    // hand can.
    sourcemap: true,
    rollupOptions: {
      // The prod bundle is a redistribution (ADR-0090); ship every bundled dependency's license + copyright, including the OFL font notices.
      plugins: [
        license({
          thirdParty: {
            includePrivate: false,
            output: { file: LICENSE_OUTPUT_FILE, encoding: 'utf-8' },
          },
        }),
        embeddedFontLicenses(),
      ],
      output: {
        // Manual vendor splits. Goal: keep stable third-party code in
        // its own long-lived chunks so a deploy of app-only changes
        // doesn't bust the user's React/Router/OTel cache. Trade-off:
        // 3 extra HTTP requests on first paint, but each ~30-100 KB
        // gzipped over HTTP/2 multiplexing is negligible against the
        // cache-hit rate on returning visits. Without these, every
        // app change reinvalidates the entire 240 KB gzipped bundle.
        //
        // Only split vendors that are (a) large enough to matter,
        // (b) genuinely stable across most deploys, and (c) loaded
        // on every route. Per-route code stays in the default chunk
        // — Rollup's automatic splitting handles dynamic imports if
        // we add them later.
        manualChunks: (id) => {
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (id.includes('/node_modules/@tanstack/')) {
            return 'vendor-router';
          }
          if (id.includes('/node_modules/@opentelemetry/')) {
            return 'vendor-otel';
          }
          // Default — everything else stays with the app bundle. Ark
          // UI (~150 KB) is intentionally NOT split: it's used on
          // nearly every route, would invalidate alongside app code
          // on most deploys anyway, and a separate chunk just adds a
          // round-trip without a caching win.
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    // Vitest's default discovery globs `**/*.{test,spec}.ts`, which
    // would pick up `frontend/e2e/*.spec.ts` (Playwright tests, no
    // jsdom, no vitest globals). Exclude e2e/ — Playwright's own
    // runner handles them via `pnpm e2e`.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
