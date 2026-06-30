# Gate solo validation; upgrade hints to whole-word

- **Date:** 2026-06-30
- **Bounded contexts:** `grid/` (api + application + domain), `frontend/`
- **Status:** design approved, plan pending

## Problem

The play modes currently share one validation idiom: per-word, server-checked,
with a discreet "validating" pulse and per-word auto-lock. For **solo** grids
this makes the puzzle too easy — the game tells you, word by word, exactly when
each entry is right. We want solo to be a single "is the whole grid valid?"
verdict, with no per-word or per-cell feedback, and we want the hint affordance
to compensate for the higher difficulty by revealing a **whole word** instead of
a single letter.

**Minigame** and **multiplayer (coop)** keep per-word validation and the pulse
unchanged — they are deliberately tighter feedback loops.

## Goals

1. Solo grids no longer validate per word. No per-word pulse, no per-word
   auto-lock.
2. Solo validation is whole-grid and **binary** — "valid" or "not valid yet" —
   with no indication of which cells/words are wrong.
3. The check fires automatically when the grid is completely filled (no manual
   "Vérifier" button).
4. A hint reveals the **whole word the cursor is currently in**, not a single
   letter. Budget stays 1 hint per reveal.
5. Minigame and coop are untouched.

## Non-goals

- No change to minigame token validation or coop WebSocket validation.
- No change to the hint *budget* mechanism (still 1 unit per request,
  per-`(puzzle, user)` in Postgres).
- No new play-mode enum or grid-component restructuring beyond what these
  changes require.

## Current state (verified against code)

- `POST /v1/puzzles/{id}/validate` →
  `ValidatePuzzleResult { solved: Boolean, incorrectCells: List<Position> }`
  (`grid/api/.../dto/ValidatePuzzleDto.kt:24`). `solved` is already a whole-grid
  binary. The response never returns canonical letters.
  - Consumed **only by solo** — the manual "Vérifier" hook (`usePuzzleValidation`)
    and the per-word auto-validation hook (`useWordAutoValidation`). Minigame uses
    token verify; coop uses WS `wordLocked` events. Neither touches `/validate`.
- `POST /v1/puzzles/{id}/hints` →
  request `{ row, column }`, response `{ row, column, letter, hintsRemaining }`
  (`grid/api/.../dto/RevealCellHintDto.kt`). Resolves one cell's canonical letter
  from `grid.cells[Position]`. Budget decremented once per request
  (`PostgresHintUsageRepository.kt:66`).
- The domain models words as first-class objects: `WordPlacement` carries
  `direction`, `cluePosition`, and `letterPositions(): List<Pair<Position, Char>>`
  (`grid/domain/.../WordPlacement.kt:18`); `Grid.placements` is the canonical word
  inventory (`grid/domain/.../Grid.kt:7`). So `(row, column, direction)` resolves
  to a full word's cells and letters server-side.
- Solo screen: `PlayScreen` wires `useWordAutoValidation`, `usePuzzleValidation`,
  `useHintRequest`. Letters live in the DOM (ADR-0002 uncontrolled inputs);
  `soloEntriesStore` persists letters + locks (and feeds ADR-0075 cross-device
  sync).

## Design

### A. Solo validation: per-word → whole-grid binary

**Wire (breaking, alpha-acceptable):** `/validate` response drops
`incorrectCells`. New shape: `ValidatePuzzleResult { solved: Boolean }`.

- Backend: `ValidatePuzzleUseCase` stops computing incorrect cells; the DTO and
  the openapi schema drop the field. No dead code — remove the computation, not
  just the field. This *tightens* the answer-on-wire posture (the response is now
  a pure binary oracle), so it needs no ADR.

**Frontend:**

- Remove `useWordAutoValidation` from solo entirely (the per-word pulse +
  auto-lock). This reverts the solo portion of the "extend the discreet
  validating pulse to solo + coop" change; the minigame pulse and the coop pulse
  stay.
- Cells are freely editable as the player types — no per-word checks, no pulse,
  no incremental locks. The only locks in solo are hint-revealed cells and the
  final solved-grid lock.
- Repurpose `usePuzzleValidation` as the whole-grid checker, triggered when the
  grid becomes completely filled rather than by a button. Remove the "Vérifier"
  button.
  - `solved: true` → existing solve flow (lock grid, win screen).
  - `solved: false` → a brief, non-cell-specific text pill:
    **"Pas encore — ta grille n'est pas tout à fait juste"** (tutoiement). No
    cell highlight, no shake of specific cells. The player edits; when the grid
    is full again, it re-checks.

### B. Hints: one letter → whole focused word

**Wire:** `POST /v1/puzzles/{id}/hints`

- Request: `{ row, column, direction }` — `direction` is the axis of the active
  entry the cursor is in (the client already tracks the focused word and its
  direction to highlight it).
- Response: `{ cells: [{ row, column, letter }], hintsRemaining }` — every cell
  of the resolved word.

**Posture:** a whole-word reveal leaks N letters per request where the old hint
leaked one. This **extends** the already-accepted per-letter hint exception to
ADR-0076 (answers off the wire, hints excepted) rather than introducing a new
class of leak. Documented as a one-line amendment note referencing ADR-0076 in
the schema PR; no full new ADR.

**Backend** (grid-application + grid-api):

- New resolution: find the `WordPlacement` in `Grid.placements` whose
  `letterPositions()` covers `(row, column)` along `direction`; return all its
  `(Position, letter)` pairs.
- Budget unchanged: 1 `trySpend` per request regardless of word length.
- Error cases preserved: 401 auth-required, 400 invalid coord / no word at
  position in that direction, 429 budget-exhausted.

**Frontend:**

- `HintControl` reveals the currently-focused word (it already reads the focused
  cell; extend to the focused entry + its direction).
- `useHintRequest` posts `{ row, column, direction }`, writes every returned
  letter to the DOM, and locks those cells. If the reveal completes the grid, the
  whole-grid binary check fires as normal.

### C. Untouched

- **Minigame** (`MiniGame.tsx`): per-word token validation + pulse. No change.
- **Coop** (`LiveCoopScreen` / `useCoopValidating`): server-authoritative WS
  validation + pulse. No change.

## Rollout (schema-first, plan-as-waves — ADR-0001 §3, ADR-0003)

1. **Wave 1 — schema-only PR** (`grid/api/openapi.yaml`): `/validate` drops
   `incorrectCells`; `/hints` request gains `direction` and response returns
   `cells[]`. One-line ADR-0076 amendment note for the whole-word hint posture.
   Gate: `openapi-lint`. Bundle this design doc with the PR.
2. **Wave 2 — grid backend**: `ValidatePuzzleUseCase` stops computing incorrect
   cells (DTO drops the field); new whole-word hint resolution in the hint use
   case + route DTO. Tests (TDD for domain/application logic). Gate: `ci`,
   Konsist.
3. **Wave 3 — frontend**: `pnpm api:check` regen (drift gate); strip solo
   per-word validation, add full-grid auto-binary + fail pill, remove the
   Vérifier button; wire whole-word hints in `HintControl` + `useHintRequest`.
   Gates: frontend build, vitest, e2e, a11y, openapi-typescript-drift.

Each wave is fully reviewed and merged before the next starts; review may
reshape later waves.

## Risks / open edges

- **ADR-0075 cross-device sync**: solo loses per-word locks; the persisted blob
  still carries letters + (now fewer) locks. Confirm the sync layer doesn't
  assume per-word lock granularity. Wave 3 verification item.
- **Re-validation churn**: auto-check on every "grid full" transition means a
  full-but-wrong grid re-POSTs each time the player refills the last cell.
  Acceptable; debounce only if it proves noisy.
- **Direction resolution**: a cell can belong to two entries (across + down).
  Sending `direction` disambiguates; verify the client always has an
  unambiguous active direction when the hint button is enabled.
