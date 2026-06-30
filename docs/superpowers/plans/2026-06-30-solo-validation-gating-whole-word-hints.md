# Solo Validation Gating + Whole-Word Hints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this repo dispatches each wave as
> one PR via the `dispatch` skill (worktree-isolated implementer → §6a review →
> merge → next wave). Steps use checkbox (`- [ ]`) syntax for tracking. Within a
> wave, follow TDD: failing test first, then implementation.

**Goal:** Make solo grids validate as a single whole-grid binary verdict (no
per-word feedback), and make a hint reveal the whole focused word instead of one
letter — while leaving minigame and coop validation unchanged.

**Architecture:** Schema-first across three sequential PRs. Wave 1 changes the
`grid` openapi contract (drop `incorrectCells` from `/validate`; make `/hints`
whole-word). Wave 2 implements the backend. Wave 3 regenerates frontend types and
reworks the solo screen + hint UI. Each wave is fully reviewed and merged before
the next starts.

**Tech Stack:** Kotlin 2.3.21 + Ktor (grid api/application/domain), kotlinx-
serialization; Vite + React 19 + TS + Panda CSS + Ark UI (frontend); Vitest +
Playwright; openapi-typescript codegen.

**Spec:** `docs/superpowers/specs/2026-06-30-solo-validation-gating-whole-word-hints-design.md`

## Global Constraints

- Schema-only PR first; no implementation in Wave 1 (ADR-0001 §3, ADR-0003).
- 400-line diff cap per PR (excl. generated code) — invoke the standing override
  with justification if a wave legitimately exceeds it.
- Conventional commits, bounded-context scope, `-s` sign-off; branch
  `<type>/<desc>`.
- French copy uses **tutoiement** ("tu", never "vous").
- No `println` / `console.log`; structured logs only.
- Comments: one line, non-obvious *why* only; no multi-line blocks.
- TDD for domain/application logic; mock only at external boundaries.
- Frontend letters live in the DOM (ADR-0002 uncontrolled inputs) — do not move
  them into React state.
- Whole-word hint posture extends ADR-0076; add the one-line amendment note in
  Wave 1, do not write a new ADR.

---

## Wave 1 — Schema-only PR (`grid/api/openapi.yaml`)

**Branch:** `feat/grid-validation-hint-schema` · **Scope:** `feat(api-grid):`
**Gate:** `openapi-lint`. Bundle the spec doc with this PR.
**Pre-read:** run `scripts/adr-context.sh grid/api/openapi.yaml` (ADR-0076 governs
answer-on-wire).

### Task 1.1: `/validate` response drops `incorrectCells`

**Files:**
- Modify: `grid/api/openapi.yaml` — `ValidatePuzzleResult` schema.
- Modify: this design doc bundled into the PR.

**Interfaces:**
- Produces: `ValidatePuzzleResult { solved: boolean }` (was
  `{ solved, incorrectCells }`).

- [ ] **Step 1:** In `ValidatePuzzleResult`, remove the `incorrectCells`
  property and its entry from `required`. Update the schema `description` to note
  the response is now a pure binary verdict (no positional data).
- [ ] **Step 2:** Remove the now-unreferenced `incorrectCells` item schema /
  `PositionDto` reference *only if* nothing else in the file references it (grep
  first; `PositionDto` is likely shared — leave it if referenced elsewhere).
- [ ] **Step 3:** `cd frontend && pnpm api:check` locally to confirm the spec
  parses and regenerates without error (do not commit the regen here — that is
  Wave 3).
- [ ] **Step 4:** Commit: `feat(api-grid): drop incorrectCells from validate response`

### Task 1.2: `/hints` becomes whole-word

**Files:**
- Modify: `grid/api/openapi.yaml` — hint request + response schemas, and the
  ADR-0076 amendment note.

**Interfaces:**
- Produces:
  - Request `RevealWordHintRequest { row: int, column: int, direction: Direction }`
    where `direction` is a `$ref` to the **existing** `#/components/schemas/Direction`
    enum (`[across, down]`, `x-enum-varnames: [ACROSS, DOWN]`, openapi.yaml:918) —
    the same enum `Clue.direction` already uses. Do NOT invent a 4-way enum; the
    wire is 2-way (axis). `(row, column)` is the player's *current cursor cell*
    (any cell in the word, not necessarily the first), and `direction` is its
    axis; the pair uniquely identifies the word (a cell is in ≤1 horizontal and
    ≤1 vertical entry).
  - Response `RevealWordHintResult { cells: [{ row: int, column: int, letter: string }], hintsRemaining: int }`.

- [ ] **Step 1:** Confirm the `Direction` schema (`[across, down]`) at
  openapi.yaml:918 — reuse it via `$ref`, do not add a new enum.
- [ ] **Step 2:** Update the hint request schema to add `direction` (required),
  `$ref`-ing `#/components/schemas/Direction`. Keep `row`, `column`.
- [ ] **Step 3:** Replace the hint response schema: remove top-level `row`,
  `column`, `letter`; add `cells` (array of `{row, column, letter}`); keep
  `hintsRemaining`.
- [ ] **Step 4:** Add a one-line comment/description on the hint operation: the
  whole-word reveal extends the per-letter hint exception to ADR-0076.
- [ ] **Step 5:** Keep the 400 (invalid coord / no word in that direction), 401
  (auth), 429 (budget) responses documented.
- [ ] **Step 6:** `pnpm api:check` parses clean.
- [ ] **Step 7:** Commit:
  `feat(api-grid): reveal whole word on hint (ADR-0076 amendment)`

**Wave 1 done when:** `openapi-lint` green, §6a LGTM, merged.

---

## Wave 2 — grid backend (`grid/application`, `grid/api`, `grid/domain`)

**Branch:** `feat/grid-validation-hint-backend` · **Scope:** `feat(grid-application):` / `feat(api-grid):`
**Gate:** `ci` (Gradle build, tests, Spotless, Konsist).
**Pre-read:** `scripts/adr-context.sh grid/application/... grid/api/routes/PuzzleRoute.kt`

### Task 2.1: `ValidatePuzzleUseCase` stops computing incorrect cells

**Files:**
- Modify: `grid/application/.../puzzle/ValidatePuzzleUseCase.kt`
- Modify: `grid/api/.../dto/ValidatePuzzleDto.kt` (drop `incorrectCells` field)
- Modify: `grid/api/.../routes/PuzzleRoute.kt` (validate handler mapping)
- Test: existing `ValidatePuzzleUseCaseTest` (+ route test if present)

**Interfaces:**
- Produces: `ValidatePuzzleOutcome.Result { solved: Boolean }` (drop the
  `incorrectCells` member); `ValidatePuzzleResult { solved: Boolean }`.

- [ ] **Step 1 (RED):** Update/replace the use-case test so it asserts only on
  `solved` (true when all filled + correct; false otherwise) and that the outcome
  no longer carries incorrect-cell data. Remove tests that asserted specific
  incorrect positions. Run — expect compile failure / red.
- [ ] **Step 2 (GREEN):** Remove the incorrect-cell computation from the use case;
  outcome carries only `solved`. Drop the field from the DTO; update the route to
  respond `ValidatePuzzleResult(solved = outcome.solved)`.
- [ ] **Step 3:** Grep `incorrectCells` across `grid/` — remove every now-dead
  reference (no dead code). Run `./gradlew :grid:application:test :grid:api:test`.
- [ ] **Step 4:** `./gradlew spotlessApply` then `spotlessCheck`.
- [ ] **Step 5:** Commit: `feat(grid-application): validate returns binary verdict only`

### Task 2.2: Whole-word hint resolution

**Files:**
- Modify: `grid/application/.../puzzle/RevealCellHintUseCase.kt` (rename to
  `RevealWordHintUseCase` or generalize — keep one use case; no dead old one)
- Modify: `grid/api/.../dto/RevealCellHintDto.kt` (request adds `direction`;
  response returns `cells`)
- Modify: `grid/api/.../routes/PuzzleRoute.kt` (hint handler)
- Possibly add: a domain helper on `Grid`/`WordPlacement` to find the placement
  covering `(position, direction)` if one doesn't already exist.
- Test: `RevealWordHintUseCaseTest`, `WordPlacement`/`Grid` domain tests

**Interfaces:**
- Consumes: `Grid.placements: List<WordPlacement>`,
  `WordPlacement.direction: Direction`,
  `WordPlacement.letterPositions(): List<Pair<Position, Char>>`,
  `HintUsageRepository.trySpend(...)`.
- Produces: outcome `Granted { cells: List<{row, column, letter}>, hintsRemaining: Int }`;
  `RevealWordHintResult { cells, hintsRemaining }`.

- [ ] **Step 1 (RED — domain):** If no resolver exists, write a failing test for
  a function that, given `Grid`, a `Position`, and a wire axis (`across`/`down`),
  returns the `WordPlacement` whose `letterPositions()` covers that position along
  that axis (or null if none). Axis→domain mapping mirrors
  `GridToPuzzleMapper.toApiClueDirection()` inverted: `across → {RIGHT, DOWN_RIGHT}`,
  `down → {DOWN, RIGHT_DOWN}` (`Direction.axis` is the clean predicate —
  `WordAxis.HORIZONTAL` = across, `WordAxis.VERTICAL` = down). Test: a cell shared
  by an across + down word resolves to the correct one per axis.
- [ ] **Step 2 (GREEN — domain):** Implement the resolver (prefer a method on
  `Grid`); run domain tests.
- [ ] **Step 3 (RED — use case):** Test the hint use case: given `(puzzleId,
  userId, row, column, direction)`, when budget allows, it spends exactly one
  budget unit and returns all `(row, column, letter)` pairs of the resolved word;
  when no word matches → invalid-coord outcome; when budget exhausted → 429
  outcome. Run — red.
- [ ] **Step 4 (GREEN — use case):** Resolve the placement, map its
  `letterPositions()` to the cells list, `trySpend` once, return `Granted`. Keep
  the auth + bounds + budget guards. Run use-case tests.
- [ ] **Step 5:** Update request DTO (add `direction`), response DTO (`cells`),
  and the route mapping. Grep for the old single-letter response shape and remove
  it (no dead code).
- [ ] **Step 6:** `./gradlew :grid:domain:test :grid:application:test :grid:api:test`,
  then `spotlessApply` + Konsist (`./gradlew :grid:application:test` runs arch
  tests).
- [ ] **Step 7:** Commit: `feat(grid-application): reveal whole word on hint`

**Wave 2 done when:** `ci` green, §6a LGTM, merged.

---

## Wave 3 — frontend (`frontend/`)

**Branch:** `feat/frontend-grid-solo-validation-hint` · **Scope:** `feat(frontend-grid):`
**Gates:** frontend build, vitest, e2e, a11y, `openapi-typescript-drift`.
**Pre-read:** `scripts/adr-context.sh frontend/src/ui/...` (ADR-0002, ADR-0050,
ADR-0075).

### Task 3.1: Regenerate API types

**Files:**
- Modify (generated): `frontend/src/infrastructure/api/grid/types.ts`

- [ ] **Step 1:** `cd frontend && pnpm api:check` to regenerate against the merged
  Wave 1 spec. Commit the regen alone:
  `chore(api-grid): regenerate openapi types`. (Drift gate must be green.)

### Task 3.2: Strip solo per-word validation; add full-grid auto-binary

**Files:**
- Modify: `frontend/src/ui/play/PlayScreen.tsx`
- Modify/repurpose: `frontend/src/ui/components/grid/usePuzzleValidation.ts`
- Remove from solo path: `frontend/src/ui/components/grid/useWordAutoValidation.ts`
  (delete the file if no other mode imports it — grep first; minigame/coop do not)
- Modify: `frontend/src/ui/components/grid/PuzzleBoard.tsx` only if the solo pulse
  wiring needs removal (leave the shared `cellValidating` CSS — minigame + coop
  still use it)
- Test: `frontend/tests/...` solo validation specs + a new pill test

**Interfaces:**
- Consumes: `validatePuzzle()` repo call returning `{ solved: boolean }`.
- Produces: solo screen with no per-word pulse; an auto whole-grid check on full;
  a binary fail pill.

- [ ] **Step 1 (RED):** Write/adjust a vitest test: filling the last empty cell of
  a solo grid triggers exactly one `/validate` call; on `solved: true` the grid
  locks + win flow; on `solved: false` the fail pill renders the exact copy
  **"Pas encore — ta grille n'est pas tout à fait juste"** and no specific cell is
  marked wrong. Run — red.
- [ ] **Step 2 (RED):** Write a test asserting no per-word validation fires while
  typing an interior word (no `/validate` call until the grid is full; no per-word
  lock). Run — red.
- [ ] **Step 3 (GREEN):** Remove `useWordAutoValidation` from `PlayScreen`; delete
  the hook file if unreferenced. Repurpose `usePuzzleValidation` to fire on the
  "grid full" transition (compute fill-complete from the DOM as the existing hooks
  do) instead of a button; read `solved` only. Remove the "Vérifier" button.
  Render the fail pill on `solved:false`.
- [ ] **Step 4:** Remove the now-dead solo branch of the validating pulse (keep
  minigame + coop). Grep for `incorrectCells` usage in frontend — remove.
- [ ] **Step 5 (GREEN):** `pnpm test` (targeted), then `pnpm typecheck`.
- [ ] **Step 6:** Commit: `feat(frontend-grid): solo whole-grid binary validation`

### Task 3.3: Whole-word hint in `HintControl` + `useHintRequest`

**Files:**
- Modify: `frontend/src/ui/components/grid/useHintRequest.ts`
- Modify: `frontend/src/ui/components/grid/HintControl.tsx`
- Modify: `frontend/src/ui/play/PlayScreen.tsx` (`handleHintReveal` writes N
  letters + locks N cells)
- Test: `frontend/tests/...` hint specs

**Interfaces:**
- Consumes: focused entry's `{ row, column, direction }` (the active word the grid
  already tracks to highlight it); repo `revealHint(row, column, direction)`
  returning `{ cells: [{row, column, letter}], hintsRemaining }`.
- Produces: hint that writes every returned letter to the DOM and locks those
  cells; budget decremented by one.

- [ ] **Step 1 (RED):** Test: requesting a hint while focused inside a word POSTs
  `{row, column, direction}` for the active entry, then writes every returned
  letter into the corresponding DOM cells and locks them; `hintsRemaining`
  decrements by one; if the reveal fills the grid, the whole-grid binary check
  fires. Run — red.
- [ ] **Step 2 (GREEN):** Update `useHintRequest` to send `direction` and apply
  the `cells[]` response (loop: write + lock each). Update `HintControl` to derive
  the active word's anchor cell + direction from the focused entry. Update
  `handleHintReveal` to iterate cells.
- [ ] **Step 3:** Update the status pill copy from "Lettre révélée : X" to a
  whole-word phrasing (tutoiement), e.g. **"Mot révélé"**.
- [ ] **Step 4 (GREEN):** `pnpm test` (targeted), `pnpm typecheck`.
- [ ] **Step 5:** Commit: `feat(frontend-grid): hint reveals the whole focused word`

### Task 3.4: Cross-device sync + e2e/a11y verification

- [ ] **Step 1:** Verify the ADR-0075 solo sync blob still round-trips with fewer
  locks (no assumption of per-word lock granularity). Add/adjust a test if the
  store encodes lock granularity.
- [ ] **Step 2:** `pnpm e2e` for the solo flow (fill grid → binary verdict; hint →
  whole word) and `pnpm a11y` (the fail pill must be announced — `role="status"`
  / aria-live).
- [ ] **Step 3:** Commit any test/a11y fixups: `test(frontend-grid): solo validation + whole-word hint coverage`

**Wave 3 done when:** all frontend gates + `openapi-typescript-drift` green, §6a
LGTM, merged.

---

## Self-review

- **Spec coverage:** Goal 1 (no per-word) → 3.2 Step 2/3; Goal 2 (binary, no
  cell info) → 1.1 + 2.1 + 3.2; Goal 3 (auto on full, no button) → 3.2; Goal 4
  (whole-word hint, budget 1) → 1.2 + 2.2 + 3.3; Goal 5 (minigame/coop untouched)
  → enforced by "grep first / leave shared CSS" notes. Posture amendment → 1.2
  Step 4. Cross-device risk → 3.4.
- **Direction enum:** Tasks 1.2/2.2/3.3 reuse the *wire* `Direction` enum
  (`[across, down]`, openapi.yaml:918) — the 2-way axis, same enum `Clue.direction`
  uses. The backend maps it onto the domain 4-way (`RIGHT|DOWN|DOWN_RIGHT|RIGHT_DOWN`)
  via `Direction.axis` (`GridToPuzzleMapper.toApiClueDirection` is the existing
  forward mapping). `clueId` was rejected as a key: it's generated fresh per
  serialization (`GridToPuzzleMapper.kt:49`), not persisted, so not recoverable
  server-side.
- **No dead code:** explicit grep-and-remove steps in 1.1, 2.1, 2.2, 3.2.
