# Design: click a definition cell to focus its word

**Date:** 2026-07-09
**Context:** `frontend/` (grid play surface)
**ADRs in scope:** ADR-0002 (frontend stack, uncontrolled-input contract), ADR-0005 (mots-fléchés model), ADR-0050 (a11y / WCAG AA)

## Problem

In the mots-fléchés grid, definition cells (the in-grid clue cells with arrows)
are currently **inert** — they have no pointer handlers. A player can only focus
a word by tapping one of its *letter* cells, or via the keyboard (Tab/Enter to
cycle clues, arrows, spacebar to toggle axis). We want tapping a definition cell
to focus the word that definition points to, and — for dual-definition cells
(two clues stacked in one cell) — a way to switch between the two definitions.

## Behavior

- **Single-definition cell → tap:** focuses that cell's answer word. Direction
  is set to the word's axis; the cursor lands on the **first editable-and-empty
  cell** of the word — skipping locked/validated cells and cells that already
  hold a typed letter — falling back to the first editable cell when the word is
  full. This reuses the semantics of `findNextEditable`
  (`useAdvanceOnValidation.ts`), so "non-validated" means exactly what it means
  everywhere else. On mobile this opens the on-screen keyboard, identical to
  tapping a letter cell: tapping a clue is intent to answer it.

- **Dual-definition cell → tap:** the first tap focuses **clue #1's** word
  (clue #1 = first entry in the cell's `clues` tuple). Tapping the **same**
  definition cell again toggles to **clue #2's** word; tapping again toggles
  back to #1. This mirrors the existing re-tap-toggles-axis idiom already used
  on letter cells (`isRepeatClick`) and the spacebar toggle. **No double-tap**
  gesture is introduced (avoids mobile double-tap latency and stays consistent
  with the established idiom).

- **Panning:** a drag that begins on a definition cell must not focus a word.
  Reuse the existing `panningRef` gate that already suppresses letter-cell
  clicks mid-pan.

## Mechanism

All changes are in `frontend/src/ui/components/grid/`. Both play surfaces
(`ui/routes/play.tsx` and the v2 `ui/play/PlayScreen.tsx`) consume
`useGridNavigation`, so wiring the handler there covers both for free.

1. **`buildLookup` (`useGridNavigation.ts`).** It already walks every
   definition cell and produces one `Clue` (`{ definition, clue, direction,
   cells }`) per definition. Add a new index
   `cluesByDefCell: Map<"row,col", readonly Clue[]>` keyed on the **definition
   cell's own position** (today the lookup is keyed only on letter cells via
   `byCell`/`cluesAt`). Tuple order is preserved, giving a stable clue #1 / #2.

2. **New `handleDefinitionClick(defPosition)` in `useGridNavigation.ts`,**
   exposed on the returned `nav` object:
   - Early-return if the pan gate (`panningRef`) is active.
   - Look up `cluesByDefCell.get(key(defPosition))`; return if absent.
   - Choose the target clue: single → the one clue; dual → toggle via a small
     `lastDefClickRef = { key, index }` ref (analogous to `lastClickedRef`):
     same def cell as last time ⇒ advance index (0→1→0), else start at index 0.
   - `setDirection(target.direction)`, compute the landing cell with the
     `findNextEditable` skip semantics, and focus that letter cell's input.
   - Focusing a **concrete first cell** *and* setting its direction uniquely
     selects the target word, so this is correct whether the two definitions in
     a dual cell share an axis or not (a cell has at most one across and one
     down word, so first-cell + direction is unambiguous).

3. **`DefinitionCellView` (`Cell.tsx`).** Add `onClick` →
   `nav.handleDefinitionClick(position)`, plus the same `onMouseDown`
   `preventDefault()` the letter cell uses (stops default blur without stealing
   focus during a pan). Thread the handler from `Grid.tsx` where the cell views
   are constructed.

## Accessibility (ADR-0050, hard gate)

Focusing any word is **already fully keyboard-operable** (Tab/Enter cycle clues,
arrow keys move, spacebar toggles axis). This feature is therefore a
**pointer-only convenience** that duplicates existing keyboard-accessible
functionality, so WCAG 2.1.1 (Keyboard) is satisfied with no change.

Consequently we do **not** add `tabindex` or `role="button"` to definition
cells:
- adding `role="button"` without a key handler would *create* a violation;
- injecting definition cells into the Tab order would disrupt the established
  clue-cycling flow.

Definition cells stay `role="gridcell"`; the `onClick` is layered on top as an
enhancement.

## Edge cases

- **Dual-def cell in coop where one word is already locked/validated:** toggling
  still visits the locked word — it simply highlights read-only, exactly as
  focusing any locked word does today — rather than skipping it. Keeps the
  toggle predictable and cheap.
- **Fully-solved / fully-locked word:** `findNextEditable` returns no editable
  cell → fall back to focusing the word's first cell (read-only focus just
  highlights the word). No keyboard opens because the input is read-only.
- **Tapping the definition of an already-focused word** (e.g. single-def word
  focused via a letter tap, then its def tapped): harmless re-focus, cursor
  recomputed to the first non-validated empty cell.

## Testing (TDD)

Unit tests via the existing grid-navigation test harness:
- single-def tap sets direction and lands on the first empty cell;
- dual-def first tap picks clue #1; repeat tap toggles #1 ↔ #2;
- landing skips validated/locked positions (inject a `validatedPositions` set);
- the pan gate suppresses focus.

Plus a light render test that `DefinitionCellView` invokes
`handleDefinitionClick` on click.

## Scope

**In:** definition-cell tap-to-focus + dual-def single-tap toggle, wired through
`useGridNavigation` + `Cell.tsx` + `Grid.tsx`, covering both play surfaces.

**Out:** arrow rendering, the clue panel, validation, keyboard navigation — all
untouched. One frontend workstream, well under the 400-line diff cap.
