# design-sync notes — WordSparrow (@bliss/frontend)

Repo-specific gotchas for future syncs. Append as you learn more.

## Source shape & scope

- `@bliss/frontend` is a **private Vite app**, not a published component
  library — no `module`/`main`/`exports`, no shipped `.d.ts`. The converter
  runs **synth-entry** style via a hand-written barrel.
- **Scope: DS core only** (13 components: `primitives/` + `brand/`). The other
  ~55 components are app-coupled screens (grid, lobby, sondage, auth, router,
  websocket) — deliberately excluded. To widen scope, add to the barrel +
  `componentSrcMap`.
- **Barrel:** `frontend/.ds-sync-entry.ts` re-exports the 13. Dot-prefixed and
  outside `src/`, so the app's tsc/panda/vite never pick it up. Passed via
  `--entry`. `PinInput` is re-exported explicitly there because
  `primitives/index.ts` omits it (real primitive, just not in the barrel).

## Build mechanics

- **buildCmd:** `pnpm panda:codegen && npx panda cssgen --outfile styled-system/styles.css`.
  Panda `codegen` emits the JS runtime; the static stylesheet (`styles.css`
  with `@layer tokens/recipes/utilities`) comes from `cssgen` — that file is
  `cfg.cssEntry`. It carries tokens + recipes + every atomic class the app uses.
- **`.design-sync/tsconfig.sync.json`** is the esbuild path-resolution tsconfig
  (`cfg.tsconfig`). Two non-obvious constraints:
  - The bundler's tsconfig-paths plugin does its OWN comment-stripping
    `JSON.parse` and does **not** follow `extends`. A `"//"` documentation KEY
    breaks its parser (the `//` trips the line-comment regex) → `paths` comes
    out undefined and the plugin silently disables. Keep this file
    comment-free.
  - Panda emits `.mjs`; the plugin's extension list resolves `/index.mjs` only
    as an explicit file, not a bare directory. So `styled-system/css` is mapped
    directly to `./styled-system/css/index.mjs`, listed BEFORE the
    `styled-system/*` wildcard (first matching rule wins).
- Build command (from repo root):
  `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./frontend/node_modules --entry ./frontend/.ds-sync-entry.ts --out ./ds-bundle`

## Render check / chromium

- Playwright JS is installed into `.ds-sync` with browser download skipped
  (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright@1.61.0 playwright-core@1.61.0`).
- The repo's playwright@1.61.0 pins chromium **1228**, but only **1217**/1181
  are cached. We drive the cached one directly:
  `export DS_CHROMIUM_PATH="$HOME/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"`
  The one-release skew (1217 vs 1228) is fine for static screenshots. If
  chromium-1217 is ever evicted, either re-point `DS_CHROMIUM_PATH` or
  `npx playwright install chromium`.

## Fonts

- Brand families ship via `cfg.extraFonts` pointing at the `@fontsource` source
  CSS (relative `./files/*.woff2`, copied into `fonts/`): Fraunces full +
  full-italic (opsz axis — needed for the Wordmark), Outfit wght, Lekton 700.
- `runtimeFontPrefixes` suppresses `[FONT_MISSING]` for `Cascadia` (a mono
  fallback in the token stack, never shipped) and the fontaine-generated
  `* fallback` families (metric-matched `local()` faces, no woff2).

## Known render warns (triaged legitimate — re-syncs check against this list)

- `[TOKENS_MISSING] --player-active-bg, --player-word-bg, --player-color,
  --player-on` — multiplayer presence colors, injected at runtime via inline
  style/JS by app screens (out of DS-core scope). Expected absent from the
  shipped stylesheet. Non-blocking.
- `[RENDER_THIN] Sparrow` — Sparrow is a pure SVG mark with no text nodes, so
  the text-based thinness heuristic flags it; the bird paints correctly
  (verified in the contact sheet). Benign.

## Preview gotchas

- Cells are **function components** (`export const X = () => <…/>`), not
  elements — the harness filters `window.__dsPreview` to `typeof === 'function'`.
- Import the component from the package name: `import { Button } from '@bliss/frontend'`
  (the story-imports shim maps it to `window.WordSparrow`). Type-only imports
  would not resolve (types are erased) — pass props inline.
- **Toast** is `position: fixed` (bottom-right). Its preview wraps the toast in
  a `transform: translateZ(0)` sized stage so the fixed element is contained in
  the cell instead of escaping to the viewport edge. `Dialog`/`Toast` use
  `cfg.overrides.<Name>.cardMode = "single"`.
- **OverflowMenu** menu body is Ark-Portal + interaction-only; the static
  preview shows the resting `…` trigger (the open state can't render statically
  through the public API — no `open` prop).

## Re-sync risks

- `styled-system/` is generated (gitignored) — always run `buildCmd` first so
  `styles.css` reflects current source before the converter copies it.
- The barrel + `componentSrcMap` are the scope contract. If a new primitive is
  added under `primitives/` it will NOT auto-sync — add it to both.
- Font subsets are pinned to specific `@fontsource` files; a fontsource major
  bump could rename them (`full.css` → ?). Re-check `extraFonts` paths exist.
