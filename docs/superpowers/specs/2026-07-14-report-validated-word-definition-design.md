# Design: Tap-to-select & report any word's definition

Date: 2026-07-14
Bounded context: `frontend/` (ui layer, grid + play)
Status: approved (brainstorming), pending implementation plan

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

## What already works (verified in code, no change needed)

- `handleDefinitionClick` (`frontend/src/ui/components/grid/useGridNavigation.ts`)
  already makes even a fully-locked word the active clue — it has no early-return
  for words with no editable cells; `landing` falls back to `target.cells[0]`,
  and `focusCell` sets `focused` state unconditionally (independent of DOM
  `.focus()` succeeding).
- The clue rail + Flag button already derive from the active clue
  (`nav.currentClue` → `displayClue` in `PlayScreen.tsx`), so a selected
  validated word is already reportable **while the puzzle is in progress**.
- The definition cell already shows its active "ring" when validated
  (`DefCell.tsx` composes `active && cellActive` regardless of `validated`).
- Validated letter cells still render an `<input>` that registers a ref
  (`LetterSlot` in `PuzzleBoard.tsx` sets `readOnly`/`tabIndex={-1}` but always
  renders the input), so focusing a locked word's cell works. A `readOnly` input
  does not raise the mobile virtual keyboard, so no phantom keyboard appears.

## Changes

### 1. Selected-word highlight on validated cells

Files: `frontend/src/ui/components/grid/PuzzleBoard.tsx`, grid `Cell` styles
(`frontend/src/ui/components/grid/Cell.tsx`).

Today the `CellState` mapping in `PuzzleBoard.tsx` is
`validated ? 'solved' : focused ? 'active' : currentWord ? 'activeWord' : 'empty'`
— the `validated` branch short-circuits, so a locked word's letter cells never
show the active/word highlight. Only the def cell rings.

Add a "solved + selected" treatment: when a validated cell is `focused` or in the
`currentWord`, keep the sage solved fill and layer a **selection outline** on top
(rather than replacing the fill with the pink active colour, which would read as
"unsolved"). Introduce the state(s) needed to express this (e.g. a
`solvedActive` / `solvedWord` variant, or an additive outline modifier) and wire
the mapping so the `validated` branch can still carry the selection outline.

Result: the whole selected word reads as selected in any state; the sage
"solved" semantics are preserved.

### 2. Keep report reachable in the won state

File: `frontend/src/ui/play/PlayScreen.tsx` (the `won ? … : …` control-area
ternary, ~line 488).

Today when the whole puzzle is won, the clue rail + `ReportClueSheet` + keyboard
are replaced by a single "Voir les résultats" button — removing every report
affordance in the terminal state, which is exactly the state where every word is
validated.

Rework the won layout to keep the **clue rail + Flag report** mounted (def-cell
taps still select a word and its clue shows in the rail), **plus** the results
button. Drop the letter keyboard in the won state — there is nothing to type. The
board (`PuzzleBoard`) remains rendered and tappable throughout, so this is a
change to the bottom control area only.

`LiveCoopScreen.tsx` uses the same `ReportClueSheet`; verify its won/end state
does not regress (in scope only to the extent of not breaking it — no new coop
behaviour required).

### 3. Accurate `wordText` for validated / hydrated words

File: `frontend/src/ui/play/PlayScreen.tsx` (the `foldReportWord(...)` word-fold
source feeding `ReportClueSheet`).

`foldReportWord` currently folds from `nav.getEntryAt(...)`, which reads
`cellValuesRef` — populated only by typing/remote-updates **this session**. A word
validated via a hint reveal, or restored from a prior session's persisted store,
folds to `''`, so its report carries no word.

Fold the report word from the **live input values** (the cells' registered
`refs` / DOM `.value`, which are hydrated for every filled cell via
`defaultValue`) so a validated word's report actually carries the word.

This stays within **ADR-0076**: the value read is the player's own entered/revealed
letters already present on the client, never a solution shipped from the server.

## Explicitly out of scope

- Making read-only **letter** cells selectable — confirmed: they stay
  non-selectable; selection is via the definition cell.
- New report reasons — the existing `ReportReason` set (`mot_offensant`,
  `definition_offensante`, `erreur_sens`, `erreur_grammaire`, `definition_revele`,
  `ambigu`, `trop_facile`, `trop_difficile`, `autre`) already covers flagging a
  validated word's definition.
- Any grid or survey **API** change — the report payload (`clueText`, optional
  `wordText`, `puzzleId`, `surface`, reason, note) is unchanged.
- The alternate `Grid.tsx` renderer (not used by the play/coop screens) — no
  changes.

## Testing

- Vitest (`frontend/tests/`):
  - Tapping the definition cell of a **fully-validated** word makes its clue the
    active `currentClue`; the highlight state includes its letter cells (selected
    outline), not just the def-cell ring.
  - The Flag → `ReportClueSheet` submits with the correct `clueText` and a
    **non-empty** `wordText` for a validated word whose letters were hydrated
    (not typed this session).
  - Read-only letter-cell taps remain no-ops (regression guard on the
    `handleClick` validated early-return).
- Won-state test: rail + Flag present, results button present, keyboard absent,
  def-cell tap still selects a word.
- a11y (`pnpm a11y`): the selection outline meets WCAG AA contrast against the
  sage solved fill; the coexisting rail + results button keep a sane focus/tab
  order (ADR-0050).

## Notes for the implementation plan

- Base off fresh `main` (done — this work is on `feat/report-validated-word-definition`
  off `origin/main`).
- Run `scripts/adr-context.sh` on the touched paths during planning. This touches
  the report flow (ADR-0103 dedupe guard), the no-solution-on-wire contract
  (ADR-0076), and a11y (ADR-0050). Expected outcome: no new ADR — this reuses the
  existing report contract and adds no dependency, context, or cross-context
  contract — but confirm before writing code.
- 400-line diff cap (ADR-0001 §4): the three changes are one workstream (enable
  reporting a validated word's definition). If the won-state layout rework pushes
  the diff over the cap, split the pure-visual highlight (change 1) into its own
  follow-up PR.
