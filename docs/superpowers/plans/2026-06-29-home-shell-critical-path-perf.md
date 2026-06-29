# Home-shell Critical-Path Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Also load the repo `frontend` skill before touching `frontend/` — it encodes the Panda/Vite/MSW gotchas.

**Goal:** Cut first-paint latency (FCP/LCP) on the WordSparrow home shell by removing the dead v1 font stack, deferring analytics/observability off the boot path, and tuning the ADR-0072 render-gate — one PR, no redesign coupling.

**Architecture:** Three independent edits to the frontend boot path (`frontend/src/main.tsx`, font CSS, Vite plugins). No domain logic; verification is build + typecheck + existing tests + before/after clean-profile Lighthouse. The score deficit is pure critical-path latency (TBT 10ms, CLS 0 already perfect), so every task targets FCP/LCP and must hold CLS at 0.

**Tech Stack:** Vite + React 19 + TanStack Router + Panda CSS + `@fontsource` variable fonts + Fontaine (metric-matched fallbacks) + OpenTelemetry web SDK + cookieless Matomo.

## Global Constraints

- **Bounded context:** `frontend/` only. No cross-context imports; respect `eslint-plugin-boundaries` layers (ADR-0002).
- **Governing ADRs:** ADR-0072 (v2 type stack / render-gate), ADR-0043 (old font stack), ADR-0074 (v1→v2 cutover), ADR-0033 (frontend OTel), ADR-0025 (cookieless Matomo). Run `scripts/adr-context.sh frontend/src/main.tsx frontend/src/design-system/fonts.css frontend/vite.config.ts` and read the bodies before coding.
- **CLS must remain 0** in the final Lighthouse run. This is a hard gate.
- **Branding intent preserved:** the main UI font (Nunito) must not flash; only the wordmark (Fredoka) may swap, cold-load only.
- **Comments:** one line, non-obvious WHY only. No multi-line comment blocks in new code.
- **Commit style:** conventional, bounded-context scope, `-s` (DCO). Type must be in the commitlint allowlist `[feat, fix, chore, refactor, test, docs]` — use `chore(frontend-ui): …` / `chore(frontend-infra): …` (NOT `perf`, which the gate rejects). End body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Diff cap:** 400 lines excl. generated. If exceeded, invoke the standing cap-override with justification (single workstream) — do not split the PR.
- **Baseline (already captured this session, clean-profile throttled mobile, wordsparrow.io):** Performance **79**, FCP **3.0s** (score 0.49), LCP **4.4s** (score 0.39), TBT 10ms, CLS 0. These are the numbers the final run is compared against.

---

### Task 1: Delete the dead v1 font stack (Fraunces / Outfit / Lekton)

**Files:**
- Delete: `frontend/src/ui/styles/fonts.css`
- Modify: `frontend/src/main.tsx:82` (remove the import)
- Modify: `frontend/package.json` (remove 3 `@fontsource` deps)
- Modify: `frontend/vite.config.ts` (remove `preloadLatinBodyFont` plugin + its registration; remove `FontaineTransform` plugin)

**Interfaces:**
- Produces: nothing consumed by later tasks. Independent.

- [ ] **Step 1: Pre-flight guard — prove the old stack is unreachable from live routes**

Run from `frontend/`:
```bash
grep -rn "fontFamily: 'heading'\|fontFamily: 'body'\|fontFamily: 'mono'\|Fraunces\|Outfit\|Lekton" src \
  --include=*.ts --include=*.tsx \
  | grep -v "design-system" | grep -v "styled-system"
```
Expected: every hit resolves to an **unregistered** v1 file — the `contribuer*.tsx` routes (not in `src/ui/router.ts`) or the old `ui/components/{layout,primitives,auth,brand,sondage}` and `ui/components/grid/Cell.tsx` that only those routes import. Cross-check against the registered route list in `src/ui/router.ts:35-56`. **If any hit traces to a registered route/component, STOP** — note it in the PR; that component will fall back to `system-ui` and the maintainer must sign off. Do not silently ship it.

- [ ] **Step 2: Remove the old-stack CSS import**

In `frontend/src/main.tsx`, delete line 82 and its preceding comment block (lines 75-81, the fontaine rationale that refers only to the old file):
```ts
// DELETE these lines (the import and the comment that explains it):
// 75-81  comment block about CSS-side @import / fontaine
// 82     import '@/ui/styles/fonts.css';
```
Leave line 84 (`import '@/design-system/fonts.css';`) and line 85 (`index.css`) intact.

- [ ] **Step 3: Delete the old-stack CSS file**

```bash
git rm frontend/src/ui/styles/fonts.css
```

- [ ] **Step 4: Remove the three dead font deps**

```bash
cd frontend && pnpm remove @fontsource-variable/fraunces @fontsource-variable/outfit @fontsource/lekton
```
This rewrites `package.json` and `pnpm-lock.yaml`.

- [ ] **Step 5: Remove the Outfit preload plugin**

In `frontend/vite.config.ts`, delete the entire `preloadLatinBodyFont` function (lines 61-97) and its registration in the `plugins` array (line 176, `preloadLatinBodyFont(),`). Its only job is preloading `outfit-latin` — now a deleted font.

- [ ] **Step 6: Remove the FontaineTransform plugin**

In `frontend/vite.config.ts`, delete the `FontaineTransform.vite({ ... })` plugin block and its leading comment (lines 131-175) from the `plugins` array. Its documented target is the now-deleted `src/ui/styles/fonts.css` (Fraunces/Outfit). Remove the now-unused `FontaineTransform` and `pathToFileURL` imports at the top of the file if nothing else uses them (grep first).

- [ ] **Step 7: Build and prove the dead fonts are gone**

```bash
cd frontend && pnpm install && pnpm build
echo "--- old fonts must NOT appear in dist ---"
ls dist/assets | grep -iE "fraunces|outfit|lekton" && echo "FAIL: dead font emitted" || echo "OK: no dead fonts"
echo "--- index.html must NOT preload outfit ---"
grep -i "outfit" dist/index.html && echo "FAIL: outfit preload remains" || echo "OK: no outfit preload"
echo "--- new-stack faces must be unchanged: confirm no NEW fontaine fallback @font-face appeared ---"
grep -c "fallback" dist/assets/*.css || true
```
Expected: `OK` on the first two. For the third — FontaineTransform previously generated fallback faces only for the old stack; after its removal the new stack must look exactly as it did before this change (block + render-gate, no fontaine fallback). If the count of metric-matched fallback faces for the **new** families changed versus `origin/main`, STOP and flag — that is a CLS-relevant behavior change outside this task's scope.

- [ ] **Step 8: Typecheck + unit tests**

```bash
cd frontend && pnpm typecheck && pnpm test
```
Expected: PASS. If a component snapshot referencing an old font family breaks, that component is dead v1 code — confirm via Step 1's reachability check before updating any snapshot; a live break means Step 1 was wrong.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -s -m "perf(frontend-ui): drop dead v1 font stack + Outfit preload

Fraunces/Outfit/Lekton (ADR-0043) are reachable only from unregistered
v1 routes post-cutover (ADR-0074). Deleting fonts.css + the Outfit-only
preload plugin removes an eager 32 KiB critical-path font fetch with no
live visual change. Fontaine plugin removed with its target file.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Defer the Matomo script download to idle

**Files:**
- Modify: `frontend/src/infrastructure/analytics/matomoTracker.ts:72-81` (the `<script>` injection)
- Test: locate the existing spec (`frontend/tests/**/matomoTracker*.test.ts` or co-located `*.test.ts`); adapt it.

**Interfaces:**
- Consumes: nothing. Independent of Task 1.
- Produces: unchanged public surface — `createMatomoTracker(config)` still returns the same `MatomoTracker` synchronously; only the script-tag injection moves to idle.

- [ ] **Step 1: Find the existing test**

```bash
cd frontend && grep -rln "createMatomoTracker\|matomoTracker" tests src --include=*.test.ts --include=*.test.tsx
```
Read it to learn how it asserts the `<script data-matomo>` injection and the `_paq` queue.

- [ ] **Step 2: Write/adjust the failing test for deferred injection**

The `_paq` config pushes must still happen synchronously (so queued calls buffer); only the `<script>` tag appears after an idle tick. In the test (jsdom has no `requestIdleCallback`, so the `setTimeout` fallback runs), assert:
```ts
import { vi, expect, test, beforeEach, afterEach } from 'vitest';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('queues _paq synchronously but injects matomo.js only after idle', () => {
  document.head.innerHTML = '';
  const tracker = createMatomoTracker({ url: 'https://analytics.example', siteId: '1' });
  // _paq is configured synchronously
  expect((window as unknown as { _paq: unknown[] })._paq.length).toBeGreaterThan(0);
  // script not yet injected
  expect(document.querySelector('script[data-matomo="1"]')).toBeNull();
  // after idle/timer flush it is
  vi.runAllTimers();
  expect(document.querySelector('script[data-matomo="1"]')).not.toBeNull();
  expect(tracker).toBeDefined();
});
```

- [ ] **Step 3: Run it red**

```bash
cd frontend && pnpm test matomoTracker
```
Expected: FAIL — script is injected synchronously today, so the "is null before idle" assertion fails.

- [ ] **Step 4: Implement the idle-deferred injection**

In `matomoTracker.ts`, replace the synchronous injection (the `if (!existing) { … document.head.appendChild(script); }` block at lines 73-81) with an idle-scheduled version. Keep the `_paq.push([...])` config block (lines 65-70) exactly where it is — synchronous.
```ts
  // Defer the 22 KiB matomo.js fetch off the critical path; _paq buffers
  // calls until it loads (Matomo async contract).
  const injectScript = () => {
    if (document.querySelector(`script[data-matomo="${siteId}"]`)) return;
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = scriptUrl;
    script.dataset.matomo = siteId;
    document.head.appendChild(script);
  };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (typeof ric === 'function') ric(injectScript);
  else setTimeout(injectScript, 0);
```

- [ ] **Step 5: Run it green**

```bash
cd frontend && pnpm test matomoTracker && pnpm typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/infrastructure/analytics/matomoTracker.ts frontend/tests
git commit -s -m "perf(frontend-infra): defer matomo.js download to idle

Inject the analytics script on requestIdleCallback (setTimeout fallback)
so its 22 KiB download leaves the critical path. _paq config stays
synchronous; Matomo's async queue replays once the script loads.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Defer OTel init via dynamic import — DROPPED (trace-coverage tradeoff rejected)

> **NOT IMPLEMENTED.** Maintainer decision (2026-06-29): losing the initial
> router-loader fetch spans was judged not worth ~23 KiB. `initOtelTracer(...)`
> remains a synchronous boot call in `main.tsx`. This task was shipped as a
> no-op; the original flagged description is retained below for the record.
>
> **Original decision gate:** this task makes `vendor-otel` (23 KiB) a lazy chunk loaded after mount. Tradeoff: the first router-loader fetches run before `FetchInstrumentation` patches `fetch`, so those initial fetch spans are lost; `DocumentLoadInstrumentation` still captures page-load timing. If losing initial-fetch spans is unacceptable, **skip this task** — the font + render-gate work carries most of the win. Implement only with maintainer assent.

**Files:**
- Modify: `frontend/src/main.tsx` (remove static OTel import at lines 25-28; replace the synchronous `initOtelTracer(...)` at line 173 with a post-mount dynamic import)

**Interfaces:**
- Consumes: nothing. Independent.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Remove the static OTel import**

In `frontend/src/main.tsx`, delete the static import (lines 24-28 region):
```ts
// DELETE:
// import {
//   initOtelTracer,
//   readOtelConfigFromEnv,
// } from '@/infrastructure/observability/otelTracer';
```

- [ ] **Step 2: Replace the synchronous init with a deferred dynamic import**

Remove the synchronous call at line 173 (`initOtelTracer(readOtelConfigFromEnv());`). After the React mount has been scheduled (after the `mount()` wiring, near the render-gate at the bottom of the file), add:
```ts
// Defer OTel so vendor-otel (23 KiB) is a lazy chunk off the critical
// path. Initial fetch spans before fetch-patch are lost by design;
// DocumentLoad timing is still captured (ADR-0033).
const deferOtel = () =>
  void import('@/infrastructure/observability/otelTracer').then((m) =>
    m.initOtelTracer(m.readOtelConfigFromEnv()),
  );
const ricOtel = (window as unknown as { requestIdleCallback?: (cb: () => void) => void })
  .requestIdleCallback;
if (typeof ricOtel === 'function') ricOtel(deferOtel);
else setTimeout(deferOtel, 0);
```

- [ ] **Step 3: Build and confirm vendor-otel is now lazy**

```bash
cd frontend && pnpm build
echo "--- vendor-otel must no longer be a static import of the entry ---"
# It should still be emitted, but NOT preloaded/modulepreloaded in index.html
grep -i "vendor-otel" dist/index.html && echo "CHECK: otel referenced in index.html" || echo "OK: otel not in entry html"
```
Expected: `OK` (vendor-otel no longer modulepreloaded by the entry). The chunk still exists in `dist/assets`, loaded on demand.

- [ ] **Step 4: Verify a page-load trace still emits (do not assume)**

With `VITE_OTEL_OTLP_ENDPOINT` set to a local catcher (or against the Pages preview with SigNoz), load the page and confirm a `documentLoad` span arrives. Per the "verify the extractor, not the producer" rule, this must be observed, not assumed. Record the result in the PR.

- [ ] **Step 5: Typecheck + tests + commit**

```bash
cd frontend && pnpm typecheck && pnpm test
```
```bash
git add frontend/src/main.tsx
git commit -s -m "perf(frontend-infra): lazy-load OTel off the boot path

Dynamic-import the tracer at idle so vendor-otel (23 KiB) leaves the
critical path. Initial fetch spans are traded for faster first paint;
DocumentLoad timing still captured (ADR-0033).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Tune the render-gate (Nunito-only, Fredoka swap, 800ms cap)

**Files:**
- Modify: `frontend/src/design-system/fonts.css:7,15` (Fredoka `font-display: block` → `swap`)
- Modify: `frontend/src/main.tsx:393-403` (render-gate)
- Modify: `docs/adr/0072-*.md` (one-line note)

**Interfaces:**
- Consumes: nothing. Independent (but logically the headline lever).
- Produces: nothing downstream.

- [ ] **Step 1: Switch Fredoka to swap**

In `frontend/src/design-system/fonts.css`, change **both** Fredoka `@font-face` blocks (lines 7 and 15) from `font-display: block;` to `font-display: swap;`. Leave Nunito, Hanken Grotesk, and Spline Sans Mono at `block`.

- [ ] **Step 2: Narrow the render-gate to Nunito and lower the cap**

In `frontend/src/main.tsx`, replace the render-gate block (lines 393-403):
```ts
// ADR-0072 §3 — render-gate: hold paint for the UI font only (Nunito),
// 800ms cap. Fredoka (wordmark) swaps in to avoid blocking on it.
if (typeof document !== 'undefined' && typeof document.fonts?.load === 'function') {
  const ready = document.fonts
    .load('1em "Nunito Variable"')
    .then(() => undefined)
    .catch(() => undefined);
  const cap = new Promise<void>((resolve) => setTimeout(resolve, 800));
  void Promise.race([ready, cap]).then(mount);
} else {
  mount();
}
```
Keep the Fredoka + Nunito preload loop (lines 86-97) as-is — preloading still speeds Fredoka's swap.

- [ ] **Step 3: One-line ADR-0072 note**

In `docs/adr/0072-*.md`, add one line under Consequences: the render-gate now waits on Nunito only with an 800ms cap; Fredoka uses `font-display:swap` (wordmark swaps cold-load only).

- [ ] **Step 4: Build + manual visual check**

```bash
cd frontend && pnpm build && pnpm preview
```
Load the preview in a clean/incognito window with network throttled (DevTools → Slow 4G), hard-reload. Confirm: (a) the hero + UI paint sooner; (b) the UI/body text shows no fallback flash (Nunito gated); (c) only the wordmark may briefly show a fallback then swap to Fredoka; (d) no layout jump on the wordmark swap. Screenshot before/after for the PR.

- [ ] **Step 5: Typecheck + tests + commit**

```bash
cd frontend && pnpm typecheck && pnpm test
```
```bash
git add frontend/src/design-system/fonts.css frontend/src/main.tsx docs/adr/0072-*.md
git commit -s -m "perf(frontend-ui): tune render-gate to Nunito-only, 800ms cap

Gate first paint on the UI font (Nunito) only and lower the cap
1200->800ms; Fredoka (wordmark) switches to font-display:swap so it no
longer blocks the mount. Preserves the no-flash intent for body/UI text
(ADR-0072 §3).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Open PR, measure, and verify the DoD

**Files:** none (process task).

**Interfaces:**
- Consumes: all prior tasks merged into the branch.

- [ ] **Step 1: Push branch and open the PR**

Branch must match `branch-name.yml` (`<type>/<desc>` — e.g. `perf/home-shell-critical-path`; rename the worktree branch if needed). PR body: name the workstream + bounded context (frontend ui/infra), link the spec, list the three+one levers, and paste the before/after Lighthouse table. Do NOT put follow-up scope in the body (the §6a fixer acts on it).

- [ ] **Step 2: Run full frontend gates locally**

```bash
cd frontend && pnpm typecheck && pnpm test && pnpm e2e && pnpm a11y
```
Expected: all PASS. (~41 v2/axe tests may fail locally on the wrong Node patch — compare against a pristine `origin/main` run before blaming this change.)

- [ ] **Step 3: Authoritative before/after Lighthouse on the Pages preview**

Once Cloudflare Pages deploys the PR preview (production build + real prod API — avoids the localhost dev-preview artifacts), run clean-profile throttled **mobile** Lighthouse (Performance) against the preview URL:
```bash
npx --yes lighthouse@latest <PAGES_PREVIEW_URL> --only-categories=performance \
  --form-factor=mobile --chrome-flags="--headless=new --no-sandbox" \
  --output=json --output-path=lh-after.json --quiet
```
Compare against the baseline (Performance 79 / FCP 3.0s / LCP 4.4s). Report the actual FCP/LCP/Performance deltas in the PR. **CLS must read 0.**

- [ ] **Step 4: Confirm the DoD checklist in the PR**

- [ ] FCP/LCP improved vs baseline (deltas posted)
- [ ] CLS still 0
- [x] OTel trace coverage unchanged (Task 3 DROPPED — OTel not deferred)
- [ ] Wordmark swap is cold-load only; no UI-font flash
- [ ] All frontend CI gates green

- [ ] **Step 5: Schedule the auto-merge cron** (per repo convention) to merge on green CI + §6a LGTM.

---

## Self-Review

**Spec coverage:** Lever 1 (dead fonts) → Task 1. Lever 2 (defer OTel + Matomo) → Tasks 2 (Matomo) + 3 (OTel, flagged with the tradeoff the spec required verifying). Lever 3 (render-gate tune) → Task 4. DoD (before/after clean-profile Lighthouse, CLS 0, frontend gates, OTel trace) → Task 5. No spec requirement is unmapped.

**Placeholder scan:** No TBD/TODO. The only conditional is Task 1 Step 1's "if a hit traces to a registered route, STOP" — that is a deliberate guard, not a placeholder, with a concrete command and expected output. Test/grep commands are concrete.

**Type consistency:** `createMatomoTracker(config)` return type unchanged (Task 2 preserves the synchronous surface). `initOtelTracer` / `readOtelConfigFromEnv` referenced by their real exported names from `otelTracer.ts` (Task 3). Render-gate uses `document.fonts.load` / `mount` exactly as the current code names them (Task 4).

**Scope:** Single workstream, one PR, within (or cap-overriding) the 400-line limit. Task 3 is independently droppable without breaking the others.
