# Mobile shell resilience — one `AppShell` primitive

**Date:** 2026-07-09
**Status:** Approved (design) — pending implementation plan
**Bounded context:** `frontend/` (ui layer)
**Governing ADR:** ADR-0054 (page-shell primitive), amended by this work.

## Problem

On mobile PWA — not reproducible under Playwright's mobile emulation —
scrollbars are misplaced and de-multiplied (a second, phantom scrollbar
appears on top of the shell's own inner scroll). The layout code also
carries visible "traces" of prior back-and-forth: stacked body-variant
classes and near-duplicate hand-rolled shells.

### Root cause

`frontend/src/ui/styles/index.css` paints the background of `html` /
`body` but places **no height constraint and no overflow lock** on the
document; `#root` has no height at all. Each screen then sets
`height: 100dvh` on *its own* shell, measured against the layout
viewport rather than `#root`.

On iOS PWA the visual viewport can be shorter than `100dvh` (URL-bar /
safe-area dynamics), so a `100dvh` shell grows taller than the visible
area and the **document** gains its own scroll — a second, misplaced
scrollbar over the shell's inner one. Playwright's mobile emulation
uses a fixed viewport where `dvh == vh`, so it never triggers.

Compounding it, there are **three divergent full-height shells**:

- `frontend/src/ui/v2/PhoneShell.tsx` — content pages, carrying four
  stacked body-variant classes (`bodyFill`, `innerFill`, `bodyWithNav`,
  `bodyFlushTop`), each with a comment about a past regression.
- `frontend/src/ui/play/PlayScreen.tsx` — solo grid, its own
  `stage` + `shell` with an absolute overlay header and bottom bar.
- `frontend/src/ui/v2/multiplayer/LiveCoopScreen.tsx` — co-op grid,
  a near-identical copy of the PlayScreen shell.

## Decisions (approved)

1. **Scope:** converge all three shells onto **one `AppShell`
   primitive**, and fix the root cause. (Chosen over hardening in place
   or a root-cause-only patch.)
2. **Grid look:** **preserve the immersive bleed** — the grid stays
   full-bleed behind a translucent floating header and translucent
   clue/keyboard bar, with edge fades. The primitive therefore has two
   modes. (Chosen over converting grid pages to solid opaque rows.)
3. **Breakpoints:** **preserve `md` (tablet rounded-card) and `lg`
   (desktop full-bleed + centered column, `DesktopAppBar` swap) exactly;
   rebuild only the mobile base.** (Chosen over unifying all
   breakpoints — desktop/tablet aren't the reported problem and a
   full-responsive rewrite risks regressing what works.)

## Design

### 1. Document lock (root-cause layer)

Add unconditional rules to `frontend/src/ui/styles/index.css` so the
document itself can never scroll:

```css
html, body { height: 100%; overflow: hidden; overscroll-behavior: none; }
#root      { height: 100%; }
```

- The shell fills a real full-height `#root` via a `height: 100%`
  chain and **stops depending on `100dvh` on mobile** — `dvh`/`svh`/
  visual-viewport mismatch becomes irrelevant because `overflow: hidden`
  clips to the visible viewport instead of growing past it.
- `overscroll-behavior: none` kills pull-to-refresh and scroll-chaining
  to the document.
- Desktop (`lg:`) keeps its existing `100dvh` per decision 3.
- `overflow: hidden` (not `position: fixed`) is used for the lock: it
  does not collapse margins or break `position: fixed` descendants.

### 2. The `AppShell` primitive

One component replacing `PhoneShell` and both grid shells, with a
`variant` prop for the two modes:

```tsx
<AppShell
  variant="flow"          // "flow" (default) | "overlay"
  topBar={…}              // row 1 — always present
  bottomBar={…}           // row 3 — optional
  navActive="accueil"     // desktop nav highlight (preserved lg behavior)
  backTo="/grilles"       // desktop back pill (preserved)
>
  {content}
</AppShell>
```

**Same skeleton in both modes — top / middle / bottom.** The only
differences are whether the middle scrolls and whether the bars are
opaque rows or floating overlays.

- **`flow`** (content pages): CSS `grid-template-rows: auto 1fr auto` →
  opaque top bar / **the single scroll container** (the `1fr` middle,
  `min-height: 0; overflow-y: auto`, owning `<main id="main-content">`)
  / optional opaque bottom nav. Replaces `PhoneShell` and **deletes all
  four body-variant classes** — the spacing logic they hacked around
  becomes the shell's responsibility.
- **`overlay`** (grid pages): `position: relative` full-height box; the
  middle (`children` = the PanZoom viewport) fills 100% with
  `overflow: hidden` and **does not scroll** (PanZoom owns pan/zoom);
  `topBar` and `bottomBar` are `position: absolute`, floating
  translucently over the bleeding grid. Edge fades stay inside the
  viewport component where they already live. Preserves the current
  immersive look exactly.

The `md`/`lg` treatments (rounded tablet card; desktop full-bleed
gradient, centered reading column, `DesktopAppBar` swap) are carried
into `AppShell` unchanged and keyed on breakpoint, not on `variant`.

### 3. Centralized safe-area insets

`env(safe-area-inset-*)` is currently re-derived in ~5 places
(`headerSlot`, `MobileTopBar`, body bottom padding, `BottomNav`). The
shell applies the **top inset at the top edge and the bottom inset at
the bottom edge exactly once**, and decides whether the bottom inset
lands on the bottom bar or on the content region (the logic
`bodyWithNav` / `bodyFlushTop` juggled manually). One source of truth
removes the double-inset / missing-inset class of bugs.

### 4. Accessibility invariants (preserved)

- `<main id="main-content" tabIndex={-1}>` landmark stays on the scroll
  region (flow) / middle (overlay).
- `SkipLink` stays as the first shell child.
- `pnpm a11y` (ADR-0050 baseline) must stay green.

## Sequencing (PRs, each ≤400 lines)

- **PR 0 — ADR amend (ADR-0054):** define the `AppShell` contract
  (variants, document lock, single scroll container) as a third layout
  primitive alongside `<ContentPage>`/`<ViewportPage>`. ADR-first per
  CLAUDE.md.
- **PR 1 — foundation:** document lock in `index.css` + `AppShell` +
  stories/tests, with `PhoneShell` re-expressed as a thin wrapper over
  `AppShell` so **no screen changes behavior yet** (purely additive,
  low-risk).
- **PR 2 — grid pages:** migrate `PlayScreen` + `LiveCoopScreen` to the
  `overlay` variant, delete their hand-rolled shells. The delicate one,
  isolated.
- **PR 3+ — content pages:** migrate the ~20 remaining screens off the
  variant props onto the clean `AppShell`, retire the dead classes.
  Mechanical; may split to stay under the cap. Dispatch candidate.

## Testing & verification

- **Structural invariants (Playwright, mobile sizes)** — catch
  regressions even though the visual PWA bug isn't reproducible there:
  - exactly one scroll container in the tree;
  - `document.scrollingElement.scrollHeight === clientHeight` (the
    document never scrolls);
  - top bar and bottom bar remain pinned while the middle scrolls.
- **a11y:** `pnpm a11y` green; `<main>` landmark + `SkipLink` present.
- **Real gate:** the maintainer confirms on the actual device / PWA
  after PR 1 lands on a preview. The fix is **not** claimed resolved
  until that confirmation — it cannot be verified in this environment.

## Risks & open items

- **Focused-input scroll on iOS:** if grid cells mount a hidden
  `<input>`, iOS may still try to scroll the locked document to reveal
  it on focus. The keyboard is custom-rendered and `useResumeBlurOnPwa`
  already manages blur, so this is expected to be fine — **verify during
  PR 2**, do not redesign around it preemptively.
- **Desktop regression surface:** `md`/`lg` CSS is carried over
  verbatim; the risk is a copy error, caught by review + existing
  desktop e2e, not by mobile testing.
