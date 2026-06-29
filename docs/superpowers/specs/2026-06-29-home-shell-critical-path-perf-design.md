# Home-shell critical-path performance — design

**Date:** 2026-06-29
**Status:** Approved (brainstorming → ready for plan)
**Bounded context:** `frontend/` (ui + infrastructure)
**Governing ADRs:** ADR-0072 (v2 type stack / render-gate), ADR-0043 (original
font stack), ADR-0074 (v1→v2 cutover), ADR-0033 (frontend OTel), ADR-0025
(cookieless Matomo), ADR-0002 (frontend stack).

## Context

Prod Lighthouse (clean-profile, throttled mobile) scores Performance ~79–87.
The deficit is **entirely first-paint latency** — TBT 10ms and CLS 0 are
already perfect, so this is not a JS-execution or layout problem. The whole
loss is in **FCP ~3.0s (score 0.49)** and **LCP ~4.4s (score 0.39)**.

> Note: the prod **Best Practices 81** that prompted this investigation was an
> unrelated browser-extension artifact (`content.js` deprecated `unload`
> listener); clean-profile Best Practices is 96. This spec is scoped to
> Performance only.

Investigation (file-cited) found three critical-path costs on the home shell:

1. **A dead v1 font stack is still bundled and partly preloaded.** Post-v2
   cutover (ADR-0074), `router.ts` registers only v2 routes. The old ADR-0043
   families — **Fraunces / Outfit / Lekton** — are referenced only by
   unregistered `contribuer` routes and the old `Page`/`AppHeader`/primitive
   components those routes import (tree-shaken from the live bundle). But
   `src/ui/styles/fonts.css` is a side-effect import (`main.tsx:82`), so its
   three `@font-face` blocks ship regardless. Worse, the `preloadLatinBodyFont`
   Vite plugin (`vite.config.ts:61-97`) injects a `<link rel=preload>` for
   `outfit-latin` — a **32 KiB eager critical-path fetch of a dead font**.

2. **OTel and Matomo initialise synchronously at boot.** `initOtelTracer`
   (`main.tsx:173`) and `createMatomoTracker` (`main.tsx:250`) run before the
   React mount, pulling ~45 KiB of JS (`vendor-otel` 23 KiB + `matomo.js`
   22 KiB) onto the critical path.

3. **The render-gate blocks all paint up to 1.2s.** `main.tsx:393-403`
   (ADR-0072 §3) defers the React mount until *both* Fredoka and Nunito load,
   capped at 1200ms, to avoid a flash-of-fallback on the brand faces. The home
   hero illustration (the likely LCP element) sits behind this gate, so the cap
   directly inflates FCP/LCP under throttling.

## Goal

Quick, high-confidence wins. One PR, one workstream ("trim the home-shell
critical path"), low risk, measurable FCP/LCP improvement. No coupling to the
in-flight v2 type decision beyond a minor, approved render-gate tune.

Non-goals: render-blocking CSS restructuring, CDN cache-header tuning, unused-JS
code-splitting, font subsetting, the Best-Practices console errors. These are
out of scope and may be revisited separately.

## Design

### Lever 1 — Delete the dead v1 font stack

- Delete `frontend/src/ui/styles/fonts.css` and its import at `main.tsx:82`.
- Remove the three dead deps from `frontend/package.json`:
  `@fontsource-variable/fraunces`, `@fontsource-variable/outfit`,
  `@fontsource/lekton`.
- With Outfit gone, `preloadLatinBodyFont` (`vite.config.ts:61-97`) has nothing
  to match → the dead 32 KiB Outfit preload disappears. Confirm the plugin
  degrades cleanly to a no-op when its target font is absent (don't leave it
  throwing); adjust or remove the plugin if it assumes the font exists.
- The `FontaineTransform` plugin (`vite.config.ts:155-175`) targets the old
  `fonts.css`; update or drop its config entry so the build doesn't reference a
  deleted file.

**Safety guard (implementer must run before deleting):** grep that no
*registered* route/component imports the `heading` / `body` / `mono` Panda
tokens or the three families. The map says they're reachable only via
unregistered v1 code; verify against the live router tree. If a stray live
component uses them, it falls back to `system-ui` (degraded, not broken) — note
any such case in the PR rather than silently shipping it.

Zero intended visual change on live routes.

### Lever 2 — Defer Matomo off the boot path

> **OTel deferral DROPPED** (maintainer decision, 2026-06-29): lazy-loading
> OTel would lose the initial router-loader fetch spans (fetch-instrumentation
> patches after those fetches), and full trace coverage was judged worth more
> than the ~23 KiB. Only Matomo is deferred. `initOtelTracer(...)` stays a
> synchronous boot call. The OTel rows below are retained struck-through for
> the record.

- Move `createMatomoTracker(...)` out of synchronous module-boot into a
  post-mount `requestIdleCallback` (with a `setTimeout` fallback for browsers
  without it). _(OTel: ~~move `initOtelTracer(...)` too~~ — dropped.)_
- Preserve existing no-op behaviour when env vars are unset (dev/preview).
- ~~**Verify** OTel still emits a page-load trace after deferral~~ — N/A, OTel
  not deferred.

No visual impact.

### Lever 3 — Tune the render-gate (branding intent preserved)

`main.tsx:393-403` and `frontend/src/design-system/fonts.css`:

- **Gate on Nunito only** (the pervasive UI/body font). It stays
  `font-display:block`, so when the gate releases there is no flash on body/UI
  text.
- **Drop Fredoka from the gate** and set it to `font-display:swap` in
  `design-system/fonts.css`. The wordmark paints immediately in fallback and
  swaps when Fredoka arrives — a brief, localized flash on the logo, **cold-load
  only** (the woff2 is a content-hashed immutable asset, so warm/cached loads
  show it instantly).
- **Lower the cap 1200ms → 800ms.**
- One-line note in ADR-0072 recording the tune (gate scope + cap). No amendment.

Rationale: the hero illustration (likely LCP) is blocked by the whole gate
today; releasing sooner improves LCP regardless of font state.

## Acceptance / Definition of Done

- Clean-profile (incognito / no-extension) throttled **mobile** Lighthouse run
  **before and after**, Performance category, with per-metric **FCP and LCP
  deltas** reported in the PR.
- **CLS must remain 0** — specifically watch the Fredoka swap on the wordmark.
- A measurable FCP/LCP improvement (no hard number committed; report the actual
  deltas).
- Frontend gates green: `pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm a11y`.
- ~~OTel page-load trace confirmed still emitting post-deferral.~~ N/A — OTel
  deferral dropped (see Lever 2).
- Diff within the 400-line cap (excl. generated); if it exceeds, invoke the
  standing cap-override with justification rather than splitting (single
  workstream).

## Risks

- **Stray live use of an old token** → system-ui fallback. Mitigated by the
  grep guard above.
- **Fredoka swap CLS** on the wordmark if fallback metrics differ. The wordmark
  is small and localized; expected sub-threshold, but the DoD gates on CLS 0.
- ~~**OTel deferral drops the document-load trace**~~ — risk removed; OTel
  deferral dropped, full trace coverage retained.
