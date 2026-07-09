# Mobile Shell Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the mobile-PWA phantom/de-multiplied scrollbar by locking the document and converging PhoneShell + the two grid shells + the hand-rolled HomeScreen shell onto one resilient `AppShell` primitive.

**Architecture:** A document-level scroll lock (`html/body/#root`) removes the only path to a second scrollbar. On top of it, one `AppShell` component provides two composition modes — `flow` (opaque top / single scroll container / opaque bottom) for content pages and `overlay` (full-bleed middle with floating translucent header + bottom bar) for grid pages — with safe-area insets applied once at the shell edges. Existing `md`/`lg` (tablet-card, desktop) treatments are carried over verbatim.

**Tech Stack:** React 19 + TypeScript, Panda CSS (`styled-system/css`), TanStack Router, Vitest (component tests in `frontend/tests/`), Playwright (`frontend/e2e/`, mobile projects `pixel-7` + `iphone-14`).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-09-mobile-shell-resilience-design.md`.
- **Governing ADR:** ADR-0054 (page-shell primitive); this work amends it (Task 1 first).
- **PR cap:** ≤400 lines of diff (excl. generated/blank), one workstream per PR (ADR-0001 §4). PR boundaries are marked in this plan.
- **Branch names:** `<type>/<short-desc>`; types ∈ {feat, fix, chore, refactor, test, docs}. `docs/` for the ADR, `refactor(frontend-*)` for the shell work.
- **Commits:** conventional + signed off (`git commit -s`), bounded-context scope, layer when it sharpens (e.g. `refactor(frontend-ui): …`). WIP → `chore(frontend): wip …`, never `wip(...)`.
- **No `console.log`.** No multi-line comment blocks in new code — one-line non-obvious *why* only (CLAUDE.md).
- **A11y (ADR-0050):** `<main id="main-content" tabIndex={-1}>` landmark and `SkipLink` as first shell child must be preserved on every screen; `pnpm a11y` stays green.
- **Preserve `md`/`lg`:** tablet rounded-card, desktop full-bleed + centered column, and the `DesktopAppBar` swap are copied over byte-for-byte. Only the mobile base is rebuilt.
- **Verification reality:** the visual PWA bug is not reproducible in Playwright. Playwright guards *structural invariants* only; the real fix is confirmed by the maintainer on-device after PR 1 reaches a preview. Do not claim "fixed" before that.
- **Gates per PR:** `pnpm typecheck`, `pnpm test`, `pnpm e2e` (at least `--project=chromium`; mobile projects in CI), `pnpm a11y`, and repo `spotlessCheck` are unaffected (frontend). Run before opening each PR.

## Why the document lock alone is not enough

`html/body { overflow: hidden }` (Task 2) immediately stops the *phantom document scroll* for every screen. But a hand-rolled shell sized `height: 100dvh` can still be taller than the visual viewport, so its bottom content gets **clipped** (not scrollable) under the lock. Migrating each shell to `height: 100%` (filling the now-full-height `#root`) removes the `dvh` dependence so nothing is clipped. That is why the shell migration (PR 2, PR 3) still matters after the lock lands.

---

## File Structure

**Created:**
- `docs/adr/0054-page-shell-primitive.md` amendment (Task 1) — existing ADR-0054 file, appended section.
- `frontend/src/ui/v2/AppShell.tsx` — the one primitive (flow + overlay).
- `frontend/tests/app-shell.test.tsx` — vitest behavior test for AppShell.
- `frontend/e2e/shell-scroll-invariants.spec.ts` — Playwright structural invariants (mobile projects).

**Modified:**
- `frontend/src/ui/styles/index.css` — document lock.
- `frontend/src/ui/v2/PhoneShell.tsx` — re-expressed as a thin wrapper over AppShell (PR 1), then deleted (PR 3).
- `frontend/src/ui/play/PlayScreen.tsx` — overlay migration (PR 2).
- `frontend/src/ui/v2/multiplayer/LiveCoopScreen.tsx` — overlay migration (PR 2).
- `frontend/src/ui/home/HomeScreen.tsx` — flow migration (PR 3).
- ~18 PhoneShell call sites (PR 3) — mechanical `<PhoneShell>`→`<AppShell>` swap once PhoneShell is retired.

---

# PR 0 — ADR amend

### Task 1: Amend ADR-0054 with the AppShell contract — **done, historical record**

PR #1495 (`docs(adr): move AppShell amendment to ADR-0054; revert misfiled ADR-0072 edit`, branch `docs/adr-0054-app-shell`) merged to `main` at 2026-07-09T06:52:26Z and completed every step below: it reverted PR #1493's erroneous section from `docs/adr/0072-wordsparrow-design-system-v2.md` and its INDEX row, added the "Amendment (2026-07-09): one AppShell primitive + document lock" section to `docs/adr/0054-page-shell-primitive.md`, and added the `ADR-0054  frontend/src/ui/v2/AppShell.tsx` row to `docs/adr/INDEX.md`. **Do not re-run these steps** — they are kept below only as the historical record of what Phase 0 did. Phase 1 is unblocked.

**Files:**
- Revert: `docs/adr/0072-wordsparrow-design-system-v2.md` — remove the erroneous "Amendment (2026-07-09): one AppShell primitive + document lock" section merged by PR #1493 (mergeCommit `f107889c`, 2026-07-09T06:39:19Z). ADR-0072 is the design-system-v2 (palette/typography/font-loading) ADR; it has nothing to do with shells or scroll locking — that PR targeted the wrong ADR.
- Revert: `docs/adr/INDEX.md` — remove the row `ADR-0072  frontend/src/ui/v2/AppShell.tsx  Amendment 2026-07-09: ...` added by the same PR. It conflicts with the pre-existing `ADR-0054  frontend/src/ui/**  Page-shell primitive` row, which already governs that exact path — two ADRs claiming the same file confuses every future `scripts/adr-context.sh` pre-read.
- Modify: `docs/adr/0054-page-shell-primitive.md` (the page-shell-primitive ADR — governs `frontend/src/ui/**` per `docs/adr/INDEX.md`; its §7 requires a new layout variant to land as an ADR amendment, not a one-off inline shell)
- Modify: `docs/adr/INDEX.md` (only if the path→ADR mapping needs a new entry for `frontend/src/ui/v2/AppShell.tsx`)

- [x] **Step 0: Revert PR #1493's erroneous ADR-0072 amendment (do this first)** — done by PR #1495.

Before amending ADR-0054, undo the wrong-ADR merge already on `main`:

```bash
git log --oneline -1 f107889c   # confirm this is the PR #1493 merge commit
```

Remove the "## Amendment (2026-07-09): one AppShell primitive + document lock" section from `docs/adr/0072-wordsparrow-design-system-v2.md` (added by that commit) and remove the corresponding `ADR-0072  frontend/src/ui/v2/AppShell.tsx  ...` row from `docs/adr/INDEX.md`. Commit this revert on its own:

```bash
git add docs/adr/0072-wordsparrow-design-system-v2.md docs/adr/INDEX.md
git commit -s -m "docs(adr-0072): revert erroneous AppShell amendment (correct ADR is 0054)"
```

- [x] **Step 1: Read the current ADR-0054 and INDEX entry** — done by PR #1495.

Run: `cat docs/adr/0054-page-shell-primitive.md` then `grep -n '0054' docs/adr/INDEX.md`.

- [x] **Step 2: Append an "Amendment (2026-07-09): AppShell" section** — done by PR #1495.

Content to add (adapt heading levels to the file):

```markdown
## Amendment (2026-07-09): one AppShell primitive + document lock

The v2 shell is unified into a single `AppShell` component with two modes:

- **flow** — `grid-template-rows: auto 1fr auto`: opaque top bar, a single
  scroll container (the `1fr` middle owns `<main id="main-content">`),
  optional opaque bottom nav.
- **overlay** — full-bleed middle (the grid viewport, `overflow: hidden`,
  no scroll) with `position: absolute` translucent top bar and bottom bar
  floating over it. Grid pages only.

Resilience invariant: the **document never scrolls**. `html, body` are
`overflow: hidden; height: 100%; overscroll-behavior: none` and `#root`
is `height: 100%`; the shell fills `#root` via a `height: 100%` chain and
does not depend on `100dvh` on mobile. Exactly one scroll container exists
per screen (the flow middle); overlay screens have none. Safe-area insets
are applied once, at the shell's top and bottom edges. `md`/`lg`
treatments are unchanged by this amendment.
```

- [x] **Step 3: Update INDEX.md if needed** — done by PR #1495, which added a narrower `ADR-0054  frontend/src/ui/v2/AppShell.tsx` row alongside the existing `frontend/src/ui/**` row.

ADR-0054 already maps `frontend/src/ui/**` (which covers `frontend/src/ui/v2/AppShell.tsx`), so no new INDEX row is expected. Verify with `grep -n '0054' docs/adr/INDEX.md`; only add a row if a narrower, more specific entry is warranted.

- [x] **Step 4: Commit** — done by PR #1495.

```bash
git add docs/adr/
git commit -s -m "docs(adr-0054): amend page-shell primitive with AppShell contract + document lock"
```

**PR 0 boundary — open PR, merge before PR 1 (ADR-first, CLAUDE.md).**

---

# PR 1 — Foundation (document lock + AppShell + PhoneShell shim)

### Task 2: Document scroll lock

**Files:**
- Modify: `frontend/src/ui/styles/index.css` (the `html, body` block near the top, ~line 22)
- Test: `frontend/e2e/shell-scroll-invariants.spec.ts` (create)

**Interfaces:**
- Produces: the global invariant `document.scrollingElement.scrollHeight === clientHeight` on every route, relied on by Task 3+ tests.

- [ ] **Step 1: Write the failing Playwright invariant test**

Create `frontend/e2e/shell-scroll-invariants.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// The document itself must never scroll — a second scrollbar is the mobile-PWA bug.
const ROUTES = ['/', '/grilles', '/play'];

for (const route of ROUTES) {
  test(`document does not scroll on ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const overflows = await page.evaluate(() => {
      const el = document.scrollingElement as HTMLElement;
      return el.scrollHeight - el.clientHeight;
    });
    // Allow 1px sub-pixel rounding; anything more is a phantom document scroll.
    expect(overflows).toBeLessThanOrEqual(1);
  });
}
```

- [ ] **Step 2: Run it to confirm it fails on the un-locked document**

Run: `cd frontend && pnpm e2e --project=pixel-7 shell-scroll-invariants`
Expected: at least one route FAILs (document scrollHeight exceeds clientHeight), proving the bug surface exists. (If it passes pre-fix because desktop content is short, still proceed — the lock is the correctness guarantee.)

- [ ] **Step 3: Add the document lock**

In `frontend/src/ui/styles/index.css`, change the existing `html, body` rule and add `#root`:

```css
html, body {
  height: 100%;
  overflow: hidden;
  overscroll-behavior: none;
  background-color: var(--colors-bg);
}
#root {
  height: 100%;
}
```

Keep the existing one-line rationale comment above the block; extend it to note the lock prevents the mobile-PWA phantom document scroll (single line).

- [ ] **Step 4: Run the invariant test — now green**

Run: `cd frontend && pnpm e2e --project=pixel-7 shell-scroll-invariants && pnpm e2e --project=iphone-14 shell-scroll-invariants`
Expected: PASS on all routes, both mobile projects.

- [ ] **Step 5: Smoke the existing e2e + a11y for regressions**

Run: `cd frontend && pnpm e2e --project=chromium && pnpm a11y`
Expected: PASS (no screen relied on document scroll).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui/styles/index.css frontend/e2e/shell-scroll-invariants.spec.ts
git commit -s -m "fix(frontend-ui): lock the document so it never scrolls (mobile-PWA phantom scrollbar)"
```

### Task 3: `AppShell` — flow variant

**Files:**
- Create: `frontend/src/ui/v2/AppShell.tsx`
- Test: `frontend/tests/app-shell.test.tsx` (create)

**Interfaces:**
- Produces:
  ```ts
  type AppShellVariant = 'flow' | 'overlay';
  interface AppShellProps {
    readonly children: ReactNode;
    readonly variant?: AppShellVariant;        // default 'flow'
    readonly topBar?: ReactNode;               // row 1 (flow) / absolute top (overlay)
    readonly bottomBar?: ReactNode;            // row 3 (flow) / absolute bottom (overlay)
    readonly navActive?: 'accueil' | 'grilles';// desktop DesktopAppBar highlight
    readonly backTo?: LinkProps['to'];         // desktop-only back pill
    readonly headerFlush?: boolean;            // topBar owns its own top spacing (e.g. MobileTopBar)
  }
  function AppShell(props: AppShellProps): JSX.Element
  ```
- Consumes: `DesktopAppBar`, `SkipLink` (existing `@/ui/v2`).

- [ ] **Step 1: Write the failing behavior test**

Create `frontend/tests/app-shell.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from '@/ui/v2/AppShell';

// Router-free render: AppShell must not require a router for the flow skeleton.
describe('AppShell (flow)', () => {
  it('exposes exactly one <main id="main-content"> scroll landmark', () => {
    render(
      <AppShell topBar={<div data-testid="tb" />} bottomBar={<div data-testid="bb" />}>
        <p>content</p>
      </AppShell>,
    );
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(screen.getByTestId('tb')).toBeInTheDocument();
    expect(screen.getByTestId('bb')).toBeInTheDocument();
  });

  it('renders the skip link as the first child', () => {
    const { container } = render(<AppShell><p>c</p></AppShell>);
    const first = container.firstChild?.firstChild as HTMLElement;
    expect(first).toHaveAttribute('href', '#main-content');
  });
});
```

- [ ] **Step 2: Run to confirm it fails (module not found)**

Run: `cd frontend && pnpm vitest run tests/app-shell.test.tsx`
Expected: FAIL — cannot resolve `@/ui/v2/AppShell`.

- [ ] **Step 3: Implement AppShell (flow branch first)**

Create `frontend/src/ui/v2/AppShell.tsx`. Port the *preserved* `md`/`lg` rules from `PhoneShell.tsx`'s `shell`/`frame`/`headerSlot`/`body`/`inner`/`deskBack` verbatim; the base (mobile) layer is the new grid skeleton:

```tsx
import type { ReactNode } from 'react';
import { Link, type LinkProps } from '@tanstack/react-router';
import { CaretLeft } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import { DesktopAppBar } from './DesktopAppBar';
import { SkipLink } from './SkipLink';

export type AppShellVariant = 'flow' | 'overlay';

export interface AppShellProps {
  readonly children: ReactNode;
  readonly variant?: AppShellVariant;
  readonly topBar?: ReactNode;
  readonly bottomBar?: ReactNode;
  readonly navActive?: 'accueil' | 'grilles';
  readonly backTo?: LinkProps['to'];
  readonly headerFlush?: boolean;
}

// Fills #root; never depends on 100dvh, so the iOS visual-viewport mismatch that caused the PWA phantom scroll can't recur.
const shell = css({
  height: '100%',
  minHeight: 0,
  bgImage: 'linear-gradient(180deg, var(--colors-ws-hero-top) 0%, var(--colors-ws-hero-bottom) 100%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  fontFamily: 'wsUi',
  md: { bgImage: 'none', bg: 'var(--colors-ws-hero-flat)', justifyContent: 'center', padding: '40px 24px' },
  lg: { bgImage: 'linear-gradient(180deg, var(--colors-ws-hero-top) 0%, var(--colors-ws-hero-bottom) 100%)', bg: 'transparent', justifyContent: 'flex-start', padding: 0, alignItems: 'stretch' },
});

// The full-height column that lays out top/middle/bottom as a 3-row grid on mobile.
const frame = css({
  width: '100%',
  maxWidth: '440px',
  flex: 1,
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  bgImage: 'linear-gradient(180deg, var(--colors-ws-hero-top) 0%, var(--colors-ws-hero-bottom) 100%)',
  md: { flex: 'none', maxWidth: '460px', height: 'min(900px, calc(100dvh - 80px))', borderRadius: '28px', overflow: 'hidden', boxShadow: '0 24px 60px rgba(33,75,64,0.18)' },
  lg: { flex: 1, maxWidth: 'none', minHeight: 0, marginInline: 0, borderRadius: 0, overflow: 'visible', boxShadow: 'none', bgImage: 'none' },
});

const headerSlot = css({ gridRow: '1', minHeight: 0, lg: { display: 'none' } });
// Non-flush headers keep the legacy top padding; flush headers (MobileTopBar) own their spacing.
const headerSlotPadded = css({ padding: 'calc(env(safe-area-inset-top) + 18px) 22px 0' });

// The single scroll container. Bottom safe-area inset lives here only when there is no bottomBar.
const body = css({
  gridRow: '2',
  minHeight: 0,
  overflowY: 'auto',
  padding: '18px 22px 28px',
  lg: { paddingInline: 0, paddingTop: '26px', paddingBottom: '56px', scrollbarGutter: 'stable' },
});
const bodyBottomInset = css({ paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)', lg: { paddingBottom: '56px' } });
const bodyFlushTop = css({ paddingTop: 0, lg: { paddingTop: '26px' } });

const bottomSlot = css({ gridRow: '3', minHeight: 0 });

const inner = css({ display: 'contents', lg: { display: 'block', width: '100%', maxWidth: '680px', marginInline: 'auto', paddingInline: '36px' } });

const deskBack = css({
  display: 'none',
  lg: { display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '18px', fontFamily: 'wsUi', fontSize: '15px', fontWeight: 'bold', color: 'ws.jadeInk', textDecoration: 'none', borderRadius: '999px', padding: '8px 14px 8px 10px', bg: 'ws.glass', boxShadow: '0 1px 2px rgba(33,75,64,0.08)', _hover: { bg: 'ws.glassHover' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } },
});

export function AppShell({ children, variant = 'flow', topBar, bottomBar, navActive, backTo, headerFlush }: AppShellProps) {
  // Overlay branch added in Task 4.
  return (
    <div className={shell} lang="fr">
      <SkipLink />
      <div className={frame}>
        <DesktopAppBar active={navActive} />
        {topBar != null ? <div className={cx(headerSlot, !headerFlush && headerSlotPadded)}>{topBar}</div> : null}
        <main id="main-content" tabIndex={-1} className={cx(body, bottomBar == null && bodyBottomInset, headerFlush && bodyFlushTop)}>
          <div className={inner}>
            {backTo != null ? (
              <Link to={backTo} className={deskBack}>
                <CaretLeft size={16} weight="bold" aria-hidden="true" />
                Retour
              </Link>
            ) : null}
            {children}
          </div>
        </main>
        {bottomBar != null ? <div className={bottomSlot}>{bottomBar}</div> : null}
      </div>
    </div>
  );
}
```

Note: the bottom nav becomes a real grid row (`gridRow: 3`) instead of `position: fixed`. This is what lets the shell reserve its space automatically and retires `bodyWithNav`. The `BottomNav`'s own `position: fixed`/`lg:hidden` must be dropped when it moves into the slot — handled in Task 5's consumer wiring (BottomNav stays visually identical; it just stops being fixed).

- [ ] **Step 4: Run the behavior test — green**

Run: `cd frontend && pnpm vitest run tests/app-shell.test.tsx`
Expected: PASS (both flow tests).

- [ ] **Step 5: Typecheck**

Run: `cd frontend && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui/v2/AppShell.tsx frontend/tests/app-shell.test.tsx
git commit -s -m "feat(frontend-ui): AppShell primitive (flow variant, 3-row grid, single scroll container)"
```

### Task 4: `AppShell` — overlay variant

**Files:**
- Modify: `frontend/src/ui/v2/AppShell.tsx`
- Test: `frontend/tests/app-shell.test.tsx`

**Interfaces:**
- Produces: `variant="overlay"` behavior — full-bleed middle, no scroll container, absolutely-positioned translucent `topBar`/`bottomBar`. Relied on by PR 2 (PlayScreen, LiveCoopScreen).

- [ ] **Step 1: Add the failing overlay test**

Append to `frontend/tests/app-shell.test.tsx`:

```tsx
describe('AppShell (overlay)', () => {
  it('renders no scroll landmark wrapper padding and keeps the main full-bleed', () => {
    render(
      <AppShell variant="overlay" topBar={<div data-testid="tb" />} bottomBar={<div data-testid="bb" />}>
        <div data-testid="viewport" />
      </AppShell>,
    );
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    // Overlay middle must not be a scroller (grid pan owns movement).
    expect(getComputedStyle(main).overflowY).not.toBe('auto');
    expect(screen.getByTestId('viewport')).toBeInTheDocument();
    expect(screen.getByTestId('tb')).toBeInTheDocument();
    expect(screen.getByTestId('bb')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd frontend && pnpm vitest run tests/app-shell.test.tsx`
Expected: FAIL — overlay currently renders the flow scroller (`overflowY: auto`).

- [ ] **Step 3: Add the overlay branch**

Add overlay CSS and branch to `AppShell.tsx`. The overlay `<main>` fills the frame, hides overflow, and is `position: relative` so `topBar`/`bottomBar` can be absolute over it. Port the desktop `lg:` reset (`position: static` bars) from `PlayScreen.tsx`'s `header`/`bottomBar` intent — but keep those *page-specific* bars as passed children; AppShell only provides positioning wrappers:

```tsx
const overlayFrame = css({
  width: '100%',
  maxWidth: '440px',
  flex: 1,
  minHeight: 0,
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  bgImage: 'linear-gradient(180deg, var(--colors-ws-hero-top), var(--colors-ws-hero-bottom))',
  md: { flex: 'none', maxWidth: '720px', height: 'min(920px, calc(100dvh - 64px))', borderRadius: '28px', boxShadow: '0 24px 60px rgba(33,75,64,0.18)' },
  lg: { flex: 1, maxWidth: 'none', borderRadius: 0, boxShadow: 'none' },
});
const overlayMain = css({ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' });
const overlayTop = css({ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3, paddingTop: 'env(safe-area-inset-top)', lg: { position: 'static', paddingTop: 0 } });
const overlayBottom = css({ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3, paddingBottom: 'env(safe-area-inset-bottom)', lg: { position: 'static', paddingBottom: 0 } });
```

Branch the component:

```tsx
  if (variant === 'overlay') {
    return (
      <div className={shell} lang="fr">
        <SkipLink />
        <div className={overlayFrame}>
          <DesktopAppBar active={navActive} />
          <main id="main-content" tabIndex={-1} className={overlayMain}>
            {topBar != null ? <div className={overlayTop}>{topBar}</div> : null}
            {children}
            {bottomBar != null ? <div className={overlayBottom}>{bottomBar}</div> : null}
          </main>
        </div>
      </div>
    );
  }
```

Note: `env(safe-area-inset-*)` moves onto the overlay wrappers so the page bars stop re-deriving it. The grid's own `padTop`/`padBottom` (which reserve space for the floating bars) stay in the page — see Task 6.

- [ ] **Step 4: Run the overlay test — green**

Run: `cd frontend && pnpm vitest run tests/app-shell.test.tsx`
Expected: PASS (flow + overlay).

- [ ] **Step 5: Typecheck + commit**

Run: `cd frontend && pnpm typecheck` → PASS.

```bash
git add frontend/src/ui/v2/AppShell.tsx frontend/tests/app-shell.test.tsx
git commit -s -m "feat(frontend-ui): AppShell overlay variant (full-bleed middle, floating bars) for grid pages"
```

### Task 5: Re-express PhoneShell as a thin wrapper over AppShell

**Files:**
- Modify: `frontend/src/ui/v2/PhoneShell.tsx`
- Modify: `frontend/src/ui/v2/BottomNav.tsx` (drop `position: fixed`; it now lives in the shell's bottom row)

**Interfaces:**
- Consumes: `AppShell` (Task 3).
- Produces: unchanged `PhoneShellProps` surface, so **no content screen changes** in PR 1. `fillBody` becomes a no-op alias (the flow body is already the single scroll container); document the removal path for PR 3.

- [ ] **Step 1: Make BottomNav layout-agnostic**

In `frontend/src/ui/v2/BottomNav.tsx`, remove `position: fixed; left/right/bottom; zIndex` from `nav` (keep the frost, border, padding incl. `env(safe-area-inset-bottom)`, and `lg: { display: 'none' }`). It now sits in the shell's `gridRow: 3` and is full-bleed by virtue of the frame width.

- [ ] **Step 2: Rewrite PhoneShell as a wrapper**

Replace the body of `frontend/src/ui/v2/PhoneShell.tsx` (keep the exported `PhoneShellProps` identical for compatibility):

```tsx
import type { ReactNode } from 'react';
import type { LinkProps } from '@tanstack/react-router';
import { AppShell } from './AppShell';

export interface PhoneShellProps {
  readonly children: ReactNode;
  readonly header?: ReactNode;
  readonly navActive?: 'accueil' | 'grilles';
  readonly backTo?: LinkProps['to'];
  readonly headerFlush?: boolean;
  readonly bottomNav?: ReactNode;
  readonly fillBody?: boolean; // deprecated: the flow body is already the single scroll container.
}

// Transitional shim (retired in PR 3) so v2 screens keep working while call sites migrate to AppShell.
export function PhoneShell({ children, header, navActive, backTo, headerFlush, bottomNav }: PhoneShellProps) {
  return (
    <AppShell variant="flow" topBar={header} bottomBar={bottomNav} navActive={navActive} backTo={backTo} headerFlush={headerFlush}>
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 3: Delete the dead variant classes**

The four body-variant classes (`bodyWithNav`, `bodyFlushTop`, `bodyFill`, `innerFill`) and the old `frame`/`headerSlot`/`body`/`inner`/`shell` defs are removed from `PhoneShell.tsx` by the rewrite above. Confirm none are imported elsewhere: `grep -rn 'bodyFill\|innerFill\|bodyWithNav' frontend/src` → no results.

- [ ] **Step 4: Verify `fillBody` screens still scroll correctly**

`GrillesArchiveScreen` used `fillBody` for a sticky tab head + inner scroll area. Under the flow shell the whole body scrolls; the segmented tab head scrolls with it. If the tabs must stay pinned, that screen keeps its own inner `flex:1; overflow:auto` child *inside* the AppShell body — verify visually in Step 6 and, if pinning is required, leave GrillesArchive's internal `scrollArea` as-is (it already has one).

- [ ] **Step 5: Run full frontend gates**

Run: `cd frontend && pnpm typecheck && pnpm test && pnpm e2e --project=chromium && pnpm a11y`
Expected: PASS. Pay attention to `archive.spec.ts`, `clue-*` specs.

- [ ] **Step 6: Manual mobile smoke (dev)**

Run: `make dev`, open at a phone viewport, click through `/`, `/grilles`, a static page (`/aide`), confirm single scrollbar, pinned top bar, bottom nav reserves space (last row not hidden).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/ui/v2/PhoneShell.tsx frontend/src/ui/v2/BottomNav.tsx
git commit -s -m "refactor(frontend-ui): PhoneShell delegates to AppShell; BottomNav joins the shell bottom row"
```

**PR 1 boundary — open PR. After merge + preview deploy, the maintainer confirms the phantom scrollbar is gone on-device before PR 2.**

---

# PR 2 — Grid pages (overlay migration)

### Task 6: Migrate PlayScreen to `AppShell` overlay

**Files:**
- Modify: `frontend/src/ui/play/PlayScreen.tsx`

**Interfaces:**
- Consumes: `AppShell` overlay (Task 4). The page keeps its own `bottomRef`/`bottomInset` ResizeObserver (the bottom bar height feeds the board's `padBottom`) and its `header`/`bottomBar` content.

- [ ] **Step 1: Replace the outer `stage`/`shell`/`main` scaffold with AppShell**

Current outer JSX (`PlayScreen.tsx` ~L459-462, L580-581):

```tsx
  return (
    <div className={stage}>
    <SkipLink />
    <main id="main-content" tabIndex={-1} className={shell} lang="fr">
      <DesktopAppBar … />
      … header … <PuzzleBoard className={viewportFill} … /> … <div className={bottomBar}> … </div>
    </main>
    </div>
  );
```

Becomes:

```tsx
  return (
    <AppShell
      variant="overlay"
      topBar={won && isDesktop ? undefined : (
        <header className={header}>{/* existing headerBar contents */}</header>
      )}
      bottomBar={<div className={bottomBar} ref={bottomRef}>{/* existing clue-rail/keyboard */}</div>}
    >
      <PuzzleBoard ref={boardRef} className={viewportFill} … edgeFade … />
      {wonLive && !winDismissed ? <WinScreen … /> : null}
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </AppShell>
  );
```

- [ ] **Step 2: Remove now-dead shell CSS from PlayScreen**

Delete the `stage` and `shell` `css(...)` defs (AppShell owns them). Keep `header`, `headerBar`, `iconBtn`, `viewportFill`, `bottomBar`, and all pill/hint styles — those are page content. Remove the now-unused `SkipLink` import (AppShell renders it) and the direct `DesktopAppBar` import if no longer referenced (AppShell renders it).

- [ ] **Step 3: Drop the per-bar safe-area inset if double-applied**

AppShell's `overlayTop`/`overlayBottom` now apply `env(safe-area-inset-*)`. Ensure `header`/`bottomBar` don't add their own top/bottom safe-area inset (they didn't — insets were on the removed shell — but verify). The board `padBottom={bottomInset + BOARD_BOTTOM_GAP}` stays; `bottomInset` still measured from `bottomRef`.

- [ ] **Step 4: Typecheck**

Run: `cd frontend && pnpm typecheck`
Expected: PASS (fix any unused-import errors from Step 2).

- [ ] **Step 5: Run grid e2e + the new invariant on /play**

Run: `cd frontend && pnpm e2e --project=chromium clue && pnpm e2e --project=pixel-7 shell-scroll-invariants`
Expected: PASS — `/play` still has no document scroll, clue/keyboard interaction unchanged.

- [ ] **Step 6: Manual grid smoke (dev)**

Run: `make dev`, open `/play` at a phone viewport: confirm the grid bleeds full-field, header pill floats, edge fades intact, zoom in/out works, keyboard + clue rail pinned to bottom, no phantom scroll. **Verify the hidden-input focus caveat**: type a letter, confirm the document doesn't jump/scroll.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/ui/play/PlayScreen.tsx
git commit -s -m "refactor(frontend-ui): PlayScreen uses AppShell overlay; delete its hand-rolled shell"
```

### Task 7: Migrate LiveCoopScreen to `AppShell` overlay

**Files:**
- Modify: `frontend/src/ui/v2/multiplayer/LiveCoopScreen.tsx`

**Interfaces:**
- Consumes: `AppShell` overlay. Same shape as Task 6; LiveCoopScreen additionally has a `claimBanner` (absolute, top: 64px) and `coopPresence` (lg) — keep both as page children inside AppShell.

- [ ] **Step 1: Replace outer scaffold with AppShell overlay** (mirror Task 6, Step 1). The `claimBanner` and `PlayerStrip`/presence overlays remain as children rendered after `PuzzleBoard`.

- [ ] **Step 2: Delete `LiveCoopScreen`'s `stage`/`shell` css defs**; keep `header`, `headerBar`, `coopPresence`, `claimBanner`, `claimPill`, `claimBtn`, `viewportFill`, `bottomBar`, `iconBtn`. Remove now-unused `SkipLink`/`DesktopAppBar` imports.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && pnpm typecheck` → PASS.

- [ ] **Step 4: Run multiplayer e2e + invariant**

Run: `cd frontend && pnpm e2e --project=chromium -g 'coop|lobby|salon' && pnpm e2e --project=pixel-7 shell-scroll-invariants`
Expected: PASS.

- [ ] **Step 5: Manual co-op smoke** — open a lobby → live game at a phone viewport; confirm presence avatars, claim banner, grid zoom, and pinned clue/keyboard all render as before with no phantom scroll.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui/v2/multiplayer/LiveCoopScreen.tsx
git commit -s -m "refactor(frontend-ui): LiveCoopScreen uses AppShell overlay; delete its duplicate shell"
```

**PR 2 boundary — open PR. Maintainer re-confirms both grid screens on-device.**

---

# PR 3 — Content pages (converge onto AppShell, retire PhoneShell)

### Task 8: Migrate HomeScreen to `AppShell` flow

**Files:**
- Modify: `frontend/src/ui/home/HomeScreen.tsx`

**Interfaces:**
- Consumes: `AppShell` flow. HomeScreen currently hand-rolls `shell`/`frame`/`content` with `MobileTopBar` + `DesktopAppBar` + `BottomNav` (~L321-326, L499).

- [ ] **Step 1: Replace the hand-rolled shell wrapper**

Current (`HomeScreen.tsx` ~L320-326 + closing + L499):

```tsx
  return (
    <main className={shell} lang="fr">
      <SkipLink />
      <div className={frame}>
        <DesktopAppBar active="accueil" streak={streak.cur} />
        <MobileTopBar onMenuClick={() => setMenuOpen(true)} />
        <div id="main-content" tabIndex={-1} className={content}>
          <div className={hub}> … </div>
        </div>
        {!miniGameTyping ? <BottomNav active="accueil" /> : null}
      </div>
    </main>
  );
```

Becomes (note `DesktopAppBar` `streak` prop — AppShell's `navActive` doesn't carry streak, so HomeScreen must pass its own DesktopAppBar. **Add an optional `desktopBar?: ReactNode` slot to AppShell** for this case, or keep HomeScreen rendering DesktopAppBar inside `children` is wrong — it belongs above the body. Use the slot):

```tsx
  return (
    <AppShell
      variant="flow"
      navActive="accueil"
      topBar={<MobileTopBar onMenuClick={() => setMenuOpen(true)} />}
      headerFlush
      bottomBar={!miniGameTyping ? <BottomNav active="accueil" /> : undefined}
      desktopBar={<DesktopAppBar active="accueil" streak={streak.cur} />}
    >
      <div className={hub}> … </div>
    </AppShell>
  );
```

- [ ] **Step 2: Add the `desktopBar` slot to AppShell**

In `frontend/src/ui/v2/AppShell.tsx`, add `readonly desktopBar?: ReactNode;` to props and render `{desktopBar ?? <DesktopAppBar active={navActive} />}` in both variants (so callers needing extra DesktopAppBar props — like `streak` — can supply their own). Update `frontend/tests/app-shell.test.tsx` to assert a passed `desktopBar` renders.

- [ ] **Step 3: Delete HomeScreen's `shell`/`frame`/`content` css defs**; keep `hub`, `hero`, and all home-specific styles. Remove unused `SkipLink` import (AppShell renders it).

- [ ] **Step 4: Typecheck + home e2e**

Run: `cd frontend && pnpm typecheck && pnpm e2e --project=chromium -g 'home|accueil' && pnpm vitest run tests/app-shell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Manual home smoke** — phone viewport `/`: greeting art, daily card, mini-game, bottom nav; confirm single scroll, pinned bars, and the mini-game-typing branch still hides the bottom nav.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui/home/HomeScreen.tsx frontend/src/ui/v2/AppShell.tsx frontend/tests/app-shell.test.tsx
git commit -s -m "refactor(frontend-ui): HomeScreen uses AppShell flow; add desktopBar slot"
```

### Task 9: Retire PhoneShell — swap call sites to AppShell

**Files (call sites, `<PhoneShell …>` → `<AppShell variant="flow" topBar={…} bottomBar={…} …>`):**
- `frontend/src/ui/routes/play.tsx` (3 wrappers: PlayUnavailable, PlayLoadError, PlayPending)
- `frontend/src/ui/routes/join.$code.tsx`
- `frontend/src/ui/routes/lobby.$lobbyId.tsx`
- `frontend/src/ui/routes/__root.tsx`
- `frontend/src/ui/v2/AProposScreen.tsx`, `AbonnementAnnuleScreen.tsx`, `AbonnementScreen.tsx`, `AbonnementSuccesScreen.tsx`, `AideScreen.tsx`, `CompteScreen.tsx`, `ConditionsAbonnementScreen.tsx`, `ConfidentialiteScreen.tsx`, `ConnexionScreen.tsx`, `GateLoadingScreen.tsx`, `GrillesArchiveScreen.tsx`, `LoaderRetry.tsx`, `MentionsLegalesScreen.tsx`, `NotFoundScreen.tsx`, `ReglagesScreen.tsx`
- `frontend/src/ui/v2/multiplayer/SalonScreen.tsx`
- Delete: `frontend/src/ui/v2/PhoneShell.tsx`

**Recipe (identical per file):**
1. Change import `PhoneShell` → `AppShell` from `@/ui/v2/AppShell`.
2. Rename the JSX element `PhoneShell` → `AppShell`, add `variant="flow"`.
3. Rename props: `header={…}` → `topBar={…}`, `bottomNav={…}` → `bottomBar={…}`. Keep `navActive`, `backTo`, `headerFlush`. **Drop `fillBody`** (no-op); if the screen relied on a pinned sub-head (only `GrillesArchiveScreen`), keep its internal `scrollArea` child as-is.
4. `pnpm typecheck` for that file.

**This task splits into ≥2 PRs if the mechanical diff exceeds 400 lines** — group by directory (routes/, v2/, v2/multiplayer/). Each sub-PR:

- [ ] **Step 1:** Apply the recipe to the group's files.
- [ ] **Step 2:** `grep -rn 'PhoneShell' frontend/src` — only the not-yet-migrated groups remain.
- [ ] **Step 3:** `cd frontend && pnpm typecheck && pnpm test && pnpm e2e --project=chromium && pnpm a11y` → PASS.
- [ ] **Step 4:** Commit: `refactor(frontend-ui): migrate <group> screens to AppShell`.

- [ ] **Final step (last sub-PR only): delete PhoneShell**

After the last group, `grep -rn 'PhoneShell' frontend/src` returns nothing → `git rm frontend/src/ui/v2/PhoneShell.tsx`. Run `cd frontend && pnpm typecheck && pnpm build`. Commit: `refactor(frontend-ui): remove PhoneShell shim; AppShell is the sole shell`.

**PR 3 boundary(ies) — open PR(s). Final maintainer on-device pass across all screens.**

---

## Self-Review

**Spec coverage:**
- Root-cause document lock → Task 2. ✔
- One AppShell primitive, flow + overlay → Tasks 3, 4. ✔
- Preserve immersive grid look → Task 4 overlay (absolute translucent bars, edge fades stay in viewport) + Tasks 6, 7. ✔
- Preserve md/lg → ported verbatim in Tasks 3, 4; stated in each. ✔
- Centralized safe-area insets → Task 3 (`bodyBottomInset` only when no bottomBar), Task 4 (`overlayTop`/`overlayBottom`). ✔
- Kill the four body-variant classes → Task 5, Step 3. ✔
- A11y invariants (`<main>`, SkipLink) → asserted in Task 3 test; preserved in every migration. ✔
- ADR-first → Task 1 (PR 0). ✔
- Structural Playwright invariants → Task 2 test, reused in Tasks 5, 6, 7. ✔
- Focused-input iOS caveat → Task 6, Step 6 explicit check. ✔
- PR sequencing / 400-line cap → PR boundaries marked; Task 9 splits by directory. ✔

**Placeholder scan:** code shown for every code step; the `{/* existing … */}` markers in Tasks 6/8 point at named, already-present JSX blocks (headerBar contents, hub) rather than unwritten code — acceptable since they're moves, not new code.

**Type consistency:** `AppShellProps` fields (`variant`, `topBar`, `bottomBar`, `navActive`, `backTo`, `headerFlush`, `desktopBar`) are consistent across Tasks 3, 4, 5, 8. `PhoneShellProps` kept identical in Task 5, removed in Task 9. `AppShellVariant = 'flow' | 'overlay'` used consistently.

**Gap fixed during review:** HomeScreen's `DesktopAppBar` needs a `streak` prop the generic `navActive` path can't supply → added the `desktopBar` slot to AppShell in Task 8, Step 2 (also covers any future screen needing custom desktop-bar props).
