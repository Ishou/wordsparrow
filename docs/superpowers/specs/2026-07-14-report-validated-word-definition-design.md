# Design: Tap-to-select & report any word's definition

Date: 2026-07-14
Bounded context: `frontend/` (ui + design-system layers, grid + play)
Status: approved (brainstorming), pending implementation plan

> Revised 2026-07-14 after re-verifying against fresh `main`: the original
> draft was explored on the stale `cycle3` branch. Two corrections: the report
> path no longer carries a client `wordText` (ADR-0111 resolves the answer word
> server-side), so the former "Change 3" is dropped; and the cell visuals live
> in the design-system `Cell`, not the grid `Cell.tsx`.

## Goal

Let a player tap a **definition (arrow) cell** to select its word in **any
state** — empty, partially filled, filled, or validated/locked — give the whole
word a visible "selected" treatment, and reach the existing Flag →
`ReportClueSheet` report for that clue.

The gap being closed: once a word is validated/locked, its letter cells become
read-only and are excluded from selection, so the player can no longer make that
word the active clue and loses the ability to flag its definition. Tapping the
definition cell must re-open that path in any state, including after the whole
puzzle is won.

Read-only **letter** cells stay non-selectable: the player selects the word via
its definition cell, not by tapping locked letters.

## What already works (verified on fresh `main`, no change needed)

- `handleDefinitionClick` (`frontend/src/ui/components/grid/useGridNavigation.ts:528`)
  already makes even a fully-locked word the active clue — no early-return for
  words with no editable cells; `landing` falls back to `target.cells[0]`, and
  `focusCell` (`:443`) sets `focused` state unconditionally (independent of DOM
  `.focus()` succeeding). Existing test
  `tests/puzzleboard-def-cell-focus.test.tsx` already asserts "a fully-locked
  word lands on its first (read-only) cell."
- The active clue derives purely from `focused` + `direction`
  (`currentClue`, `useGridNavigation.ts:596`), and the clue rail's `displayClue`
  follows it (`PlayScreen.tsx:339-355`), so a selected validated word is already
  reportable **while the puzzle is in progress**.
- The definition cell already shows its active "ring" when validated
  (`PuzzleBoard.tsx:329` → `DefCell active`).
- Validated letter cells still render an `<input>` that registers a ref
  (`LetterSlot`, `PuzzleBoard.tsx:129-145` — `readOnly`/`tabIndex={-1}`, input
  always rendered), so focusing a locked word's cell works, and a `readOnly`
  input does not raise the mobile virtual keyboard (no phantom keyboard).
- **Answer-word resolution is server-side (ADR-0111).** The report sends only
  `clueText` + `surface` + optional `puzzleId`; the server resolves the one
  answer word for that clue on that grid. So reporting a *validated* word already
  yields the correct answer word in the maintainer queue with **no** client-side
  word plumbing — and the client must not send the word (ADR-0076, ADR-0111).

## Changes

### 1. Selected-word highlight on validated cells

Files: `frontend/src/design-system/components/Cell/Cell.tsx`,
`frontend/src/ui/components/grid/PuzzleBoard.tsx`.

Today the `CellState` mapping in `PuzzleBoard.tsx:106-112` is
`validated ? 'solved' : highlight.focused ? 'active' : highlight.currentWord ? 'activeWord' : 'empty'`
— the `validated` branch short-circuits, so a locked word's letter cells stay
`'solved'` and never show the active/word highlight. Only the def cell rings.

Add an additive **selected outline** to the design-system `Cell`:

- `Cell` gains a `selected?: boolean` prop. When the cell is `state === 'solved'`
  and `selected`, layer a sakura selection **outline** on top (an `outline`, not
  a `box-shadow`, so it never clobbers the solved inset shadow — mirrors the
  existing `state === 'solved' && tinted && solvedTint` additive pattern). The
  sage solved fill is preserved. Expose it as `data-selected="true"` for tests.
- Gating on `'solved'` means non-validated cells are unaffected: their `active` /
  `activeWord` states already carry the pink selection, so passing `selected` for
  them is a no-op.
- `PuzzleBoard.tsx` `LetterSlot` passes
  `selected={highlight.focused || highlight.currentWord}` to `<Cell>`. For a
  validated word made active via a def-cell tap, the landing cell (`focused`) and
  the rest of the word (`currentWord`) all render the outline, so the whole word
  reads as selected.

Result: the selected word reads as selected in any state; the sage "solved"
semantics are preserved.

### 2. Keep report reachable in the won state

File: `frontend/src/ui/play/PlayScreen.tsx` (the `won ? … : …` `bottomBar`
ternary, `:488`).

Today when the whole puzzle is won, the `bottomBar` renders only a single "Voir
les résultats" `Button` — removing every report affordance in the terminal
state, which is exactly the state where every word is validated. (The board
`PuzzleBoard` is rendered *outside* this ternary, `:642`, so def-cell taps still
work when won — only the report affordance is missing.)

Rework so the won branch also renders the **clue rail + Flag report** (def-cell
taps select a word; its clue shows in the rail), **plus** the results button.
The letter keyboard stays absent in the won state (nothing to type), as does the
assist trailing (hint/verify are meaningless once solved).

To avoid duplicating ~15 `ClueRail` props across both branches, extract the
shared rail configuration (direction, labels, `onPrev`/`onNext`, zoom, and the
`report` node) into a single value used by both branches; the non-won branch
additionally supplies the assist `trailing` slot and is followed by `Keyboard`,
the won branch is followed by the results `Button`.

`frontend/src/ui/v2/multiplayer/LiveCoopScreen.tsx` uses the same `ReportClueSheet`
and a different end state — verify it is not regressed; no new coop behaviour is
in scope.

## Explicitly out of scope

- Making read-only **letter** cells selectable — confirmed: they stay
  non-selectable (`handleClick`'s validated early-return, `useGridNavigation.ts:465`,
  is untouched); selection is via the definition cell.
- New report reasons — the existing `ReportReason` set already covers flagging a
  validated word's definition.
- Any **`wordText` / word plumbing** on the client — deprecated by ADR-0111; the
  server resolves the word. Nothing to add.
- Any grid or survey **API** change — the report payload (`clueText`, optional
  `puzzleId`, `surface`, `reason`, `note`) is unchanged.
- The alternate `Grid.tsx` renderer (not used by the play/coop screens).

## Testing

- **Cell selected outline** (`tests/design-system-cell.test.tsx`, extend): a
  `Cell` with `state="solved" selected` renders `data-selected="true"` and stays
  axe-clean; `state="active" selected` does **not** (gated on solved).
- **PuzzleBoard highlight** (`tests/puzzleboard-def-cell-focus.test.tsx`,
  extend): after tapping the def cell of a **fully-validated** word, every letter
  cell of that word renders `data-selected="true"` (whole word reads selected),
  and cells outside the word do not.
- **Regression**: read-only letter-cell taps remain no-ops (existing
  `handleClick` validated-guard coverage stays green).
- **Won-state (app-verified, no unit seam):** no test currently renders
  `PlayScreen` (provider-heavy). Verify change 2 by driving the app to a won
  state (via the `run`/`verify` skill): confirm the clue rail + Flag are present,
  the results button is present, the keyboard is absent, and tapping a def cell
  selects a word and shows its clue + report. A Playwright e2e is optional
  follow-up only if a won-state fixture/seam exists.
- **a11y** (`pnpm a11y` / axe in unit tests): the selection outline meets WCAG AA
  contrast against the sage solved fill (ADR-0050) — light mode uses
  `sakuraDark`; dark mode switches to `sakuraRose` to clear WCAG 1.4.11 against
  the dark solved fill.

## Notes for the implementation plan

- Base off fresh `main` (done — work is on `feat/report-validated-word-definition`).
- Run `scripts/adr-context.sh` on the touched paths during planning. Relevant:
  ADR-0111 (server-resolved answer word — do **not** reintroduce client
  `wordText`), ADR-0076 (no solution on the wire), ADR-0103 (report dedupe
  guard), ADR-0050 (a11y). Expected: no new ADR — this reuses the existing
  report contract and adds no dependency, context, or cross-context contract —
  but confirm before writing code.
- 400-line diff cap (ADR-0001 §4): the two changes are one workstream. Change 1
  (Cell + PuzzleBoard) and change 2 (PlayScreen won-state) are each small; the
  combined diff should sit well under the cap. If the won-state extraction grows,
  split change 1 (pure-visual) into its own follow-up PR.
