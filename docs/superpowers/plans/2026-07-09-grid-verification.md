# Grid Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This rollout is driven by the Bliss `dispatch`/`orchestrate` cron flow: each Phase below maps to one PR dispatched to a fresh implementer agent that reads the spec + this plan + `scripts/adr-context.sh` output and runs its own TDD cycle.

**Goal:** Replace the solo hint action with a server-authoritative grid-verification action that locks correct filled cells, shakes wrong ones, and enforces a 30-minute per-puzzle cooldown.

**Architecture:** New `POST /v1/puzzles/{id}/verify` grid endpoint returns per-cell correctness for filled cells + `secondsUntilNextVerify`; `/validate` (binary) and `/hints` (dormant) are untouched. Frontend solo screen reads an assist-mode seam (hardcoded `'verify'`) and wires a new `useGridVerification` hook. Co-op is untouched.

**Tech Stack:** Kotlin 2.3.21 + Ktor (grid), Postgres via Flyway (CNPG), React 19 + TS + Panda CSS + Ark UI (frontend), OpenAPI schema-first (ADR-0003), Konsist + eslint-boundaries arch tests.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-09-grid-verification-design.md` — read in full before any phase.
- **ADR pre-read:** run `scripts/adr-context.sh <paths>` before editing; ADR-0076 (validation posture), ADR-0031 (per-session cooldown), ADR-0050 (a11y), ADR-0003 (schema-first), ADR-0001 (workflow/PR cap) are load-bearing here.
- **PR cap:** 400 lines of diff excluding generated code + blanks (ADR-0001 §4). Split if exceeded.
- **Schema-first:** no hand-editing generated `types.ts`; `pnpm api:check` regenerates; `openapi-typescript-drift` gate must pass.
- **Commits:** conventional, bounded-context scope, `git commit -s` (DCO). WIP uses `chore(<scope>): wip …` (never `wip(...)`).
- **No `println`/`console.log`; structured logs only. No cross-context imports.**
- **Copy:** inline French literals (no i18n system exists). Verb `Vérifier`.
- **Cooldown:** 30 min = **1800 s**, per `(user_id, puzzle_id)`, server-authoritative. Auth required (matches hint gating).
- **a11y (ADR-0050):** shake respects `prefers-reduced-motion`; cooldown announced via `role="status"`.

---

## Phase 1 — ADR (amends ADR-0076)

**Branch:** `docs/grid-verification-adr` · **Base:** `main` · **PR prefix:** `docs(adr):`

**Files:**
- Create: `docs/adr/00NN-grid-verification-per-cell-correctness.md` (next free number — check `docs/adr/INDEX.md`).
- Modify: `docs/adr/INDEX.md` (registry-coherence gate).

**Interfaces:**
- Produces: the accepted decision that `/verify` may return per-cell `correct` booleans (never canonical letters), gated by a 30-min per-puzzle cooldown as the answer-key rate-limit mitigation; `/validate` stays binary/uncapped; `/hints` stays dormant.

- [ ] **Step 1:** Run `scripts/adr-context.sh docs/adr/0076-*.md` and read ADR-0076 in full.
- [ ] **Step 2:** Pick the next ADR number from `docs/adr/INDEX.md`.
- [ ] **Step 3:** Write the ADR using the CLAUDE.md template. Status `Accepted`. Context: hints reveal whole words; we want a checked-work assist without shipping the answer key. Decision: `/verify` returns per-cell `correct` for filled cells only; 30-min per-puzzle server cooldown; relates to / amends ADR-0076 §§7–9. Consequences: slightly more leak than binary, bounded by the cooldown (~13 h per uniform-letter alphabet sweep), strictly less generous than the 3-free-whole-words hint.
- [ ] **Step 4:** Add the ADR row to `docs/adr/INDEX.md` (both the table and any path-mapping section that lists validation/puzzle paths).
- [ ] **Step 5:** Commit `docs(adr): per-cell grid verification, amends ADR-0076` (`-s`), open PR to `main`.

---

## Phase 2 — Schema-only (`/verify`)

**Branch:** `feat/grid-verify-schema` · **Base:** `main` (after Phase 1 merges) · **PR prefix:** `feat(api-grid):`

**Files:**
- Modify: `grid/api/openapi.yaml` — add the `/v1/puzzles/{puzzleId}/verify` path + `VerifyGridRequest`, `VerifyGridResponse`, `VerifyCellVerdict`, `VerifyCooldownResponse` schemas.

**Interfaces:**
- Produces (consumed by Phases 3 & 4):
  - Request `VerifyGridRequest`: `{ cells: VerifyCellInput[] }`, `VerifyCellInput { row: int, column: int, letter: string }`.
  - Response 200 `VerifyGridResponse`: `{ cells: VerifyCellVerdict[], secondsUntilNextVerify: int }`, `VerifyCellVerdict { row: int, column: int, correct: boolean }`.
  - Response 429 `VerifyCooldownResponse`: `{ secondsUntilNextVerify: int }` (no `cells`).
  - Responses 400 (invalid coord), 401 (auth required). Requires the identity session cookie, mirroring `/hints`.

- [ ] **Step 1:** Read the existing `/hints` and `/validate` path definitions in `grid/api/openapi.yaml` to match style (request/response naming, security, error shapes).
- [ ] **Step 2:** Add the `/verify` path + schemas, mirroring `/hints` for auth/error responses and `/validate` for the cell-list request shape.
- [ ] **Step 3:** Run `openapi-lint` locally (or the repo's lint task) and fix findings.
- [ ] **Step 4:** Commit `feat(api-grid): add POST /verify per-cell grid verification endpoint` (`-s`), open PR. This is schema-only — **no implementation** in this PR (ADR-0001 §3).

---

## Phase 3 — Grid backend (parallel with Phase 4, after Phase 2 merges)

**Branch:** `feat/grid-verify-backend` · **Base:** `main` · **PR prefix:** `feat(grid-application):`

**Files:**
- Create: `grid/domain/src/main/kotlin/com/bliss/grid/domain/puzzle/VerifyCooldownCalculator.kt`
- Create: `grid/application/src/main/kotlin/com/bliss/grid/application/puzzle/VerifyGridUseCase.kt`
- Create: `grid/api/src/main/kotlin/com/bliss/grid/api/dto/VerifyGridDto.kt`
- Modify: `grid/api/src/main/kotlin/com/bliss/grid/api/routes/PuzzleRoute.kt` (add the `/verify` route)
- Create: `grid/api/src/main/resources/db/migration/V<next>__create_puzzle_verify_usage.sql`
- Create: `grid/api/deploy/chart/templates/cronjob-verify-usage-retention.yaml`
- Ports/adapters: mirror the hint persistence port + Postgres adapter (`puzzle_hint_usage` repository) for `puzzle_verify_usage`.
- Tests: `grid/domain/src/test/.../VerifyCooldownCalculatorTest.kt`, `grid/application/src/test/.../VerifyGridUseCaseTest.kt`, serialization property test alongside the DTO.

**Interfaces:**
- Consumes: schema names from Phase 2.
- Produces: `POST /v1/puzzles/{id}/verify` behavior — 429 within cooldown (no cells), else per-cell verdicts + `secondsUntilNextVerify = 1800`, records `last_verified_at = now` on success only.

- [ ] **Step 1:** `scripts/adr-context.sh grid/api/src/main/kotlin/com/bliss/grid/api/routes/PuzzleRoute.kt grid/api/src/main/resources/db/migration/` and read matching ADRs (0076, 0031). Study `RevealCellHintUseCase.kt`, `HintBudgetCalculator.kt`, `V8__puzzle_hint_usage_token_bucket.sql`, and the hint persistence adapter as the shape to mirror.
- [ ] **Step 2 (TDD):** Write failing `VerifyCooldownCalculatorTest` — given `lastVerifiedAt` and `now`: (a) `null` last → allowed, 0 remaining; (b) 10 min ago → not allowed, `secondsUntilNextVerify == 1200`; (c) exactly 30 min ago → allowed; (d) property: `secondsUntilNextVerify` never negative, never > 1800. Run, verify FAIL.
- [ ] **Step 3:** Implement `VerifyCooldownCalculator` (pure domain; `COOLDOWN_SECONDS = 1800`). Run, verify PASS. Target near-100% mutation coverage.
- [ ] **Step 4 (TDD):** Write failing `VerifyGridUseCaseTest` — (a) within cooldown → cooldown result, no verdicts; (b) allowed → correct cells `true`, wrong cells `false`, empty cells absent, records `last_verified_at`; (c) auth-required path. Use an in-memory usage repository (never mock our own class). Run, verify FAIL.
- [ ] **Step 5:** Implement `VerifyGridUseCase` + persistence port/adapter + `VerifyGridDto` + serialization property test. Run domain/app tests + property test, verify PASS.
- [ ] **Step 6:** Add the `/verify` route to `PuzzleRoute.kt` (auth-gated, 429 on cooldown, 400 on invalid coord). Add the Flyway migration (expand-and-contract; table `puzzle_verify_usage (user_id, puzzle_id, last_verified_at)` — mirror `puzzle_hint_usage` incl. index). Add the retention cronjob template.
- [ ] **Step 7:** Run `./gradlew :grid:application:test :grid:domain:test --parallel`, `spotlessCheck`, Konsist arch tests. Fix. Commit (`-s`), open PR to `main`.

---

## Phase 4 — Frontend (parallel with Phase 3, after Phase 2 merges)

**Branch:** `feat/grid-verify-frontend` · **Base:** `main` · **PR prefix:** `feat(frontend-grid):`

**Files:**
- Modify: `frontend/src/infrastructure/api/grid/types.ts` — regenerated via `pnpm api:check` (do not hand-edit).
- Modify: `frontend/src/application/puzzle/PuzzleSolver.ts` — add `verify(puzzleId, cells)` port method + result/error types.
- Modify: `frontend/src/infrastructure/api/grid/HttpPuzzleSolver.ts` — implement `verify` → `POST /verify`, `credentials: 'include'`, map `429→cooldown-active`, `401→auth-required`, else `transient`.
- Create: `frontend/src/ui/components/grid/useGridVerification.ts` — hook (model on `useHintRequest.ts`).
- Create: `frontend/src/ui/components/grid/assistMode.ts` — `export type AssistMode = 'verify' | 'hint' | 'none'` + `export const ACTIVE_ASSIST_MODE: AssistMode = 'verify'`.
- Rename/generalize: `useHintGate.ts` → `useAssistGate.ts`; reuse `HintCooldown.tsx` + `useCountdownTicker.ts` as `AssistCooldown` seeded at 1800.
- Modify: `frontend/src/ui/play/PlayScreen.tsx` — branch on `ACTIVE_ASSIST_MODE`; render **Vérifier** affordance wired to `useGridVerification`; legacy hint chip stays behind the `'hint'` branch (dead on solo).
- Add: Panda CSS shake keyframes for wrong cells (with `prefers-reduced-motion` fallback).
- Tests: `useGridVerification.test.ts(x)`, MSW `/verify` handler in `frontend/src/infrastructure/mocks/handlers.ts`, a11y assertion.

**Interfaces:**
- Consumes: `VerifyGridRequest`/`VerifyGridResponse`/`VerifyCooldownResponse` from Phase 2; existing lock/persist path (`soloEntriesStore`, `lockedCells`, solve-beat).
- Produces: solo screen shows **Vérifier**; correct → lock, wrong → shake, cooldown ring.

- [ ] **Step 1:** `scripts/adr-context.sh frontend/src/ui/play/PlayScreen.tsx frontend/src/infrastructure/api/grid/HttpPuzzleSolver.ts` and read matching ADRs (0076, 0050, 0002). Study `useHintRequest.ts`, `HttpPuzzleSolver.ts` (both `hints` + `validate`), `HintCooldown.tsx`, `useHintGate.ts`, `usePuzzleValidation.ts`.
- [ ] **Step 2:** After Phase 2 schema is on `main`, run `pnpm api:check` to regenerate `types.ts`. Commit the regen separately (`chore(api-grid): regenerate openapi types`).
- [ ] **Step 3 (TDD):** Write failing `useGridVerification` tests — (a) collects filled unlocked cells, calls `solver.verify`; (b) locks cells returned `correct:true`, leaves `correct:false` editable + flags them shaking; (c) seeds cooldown from `secondsUntilNextVerify`, disables while pending / cooling; (d) `429` → cooldown pill, no grid change; (e) resets on puzzle change. Run, verify FAIL.
- [ ] **Step 4:** Add the `verify` port method + result/error types to `PuzzleSolver.ts`; implement in `HttpPuzzleSolver.ts`; add the MSW `/verify` handler (compute correctness from fixture solutions). Implement `useGridVerification`. Run tests, verify PASS.
- [ ] **Step 5:** Add `assistMode.ts`; generalize `useHintGate`→`useAssistGate`; generalize the cooldown component to 1800 s. Wire `PlayScreen` to branch on `ACTIVE_ASSIST_MODE`, rendering the Vérifier affordance + `AssistCooldown` + error pills with the French copy from the spec. Keep the hint branch intact but unreachable on solo.
- [ ] **Step 6:** Add Panda shake keyframes; apply to wrong cells; add `@media (prefers-reduced-motion: reduce)` static fallback. Add the a11y test asserting reduced-motion + `role="status"` cooldown announcement.
- [ ] **Step 7:** Run `pnpm typecheck`, `pnpm test`, `pnpm a11y`, and `pnpm api:check` (drift gate). Fix. Commit (`-s`), open PR to `main`.

---

## Self-Review

- **Spec coverage:** ADR (§Architecture) → Phase 1; schema (§Backend) → Phase 2; use-case + cooldown + migration + retention (§Backend) → Phase 3; port + adapter + hook + seam + affordance + shake + cooldown reuse + copy + tests (§Frontend, §Copy, §Testing) → Phase 4. Co-op untouched (non-goal) — no phase touches `game/`. All spec sections mapped.
- **Placeholder scan:** ADR/migration numbers are "next free" by design (resolved at implementation from the live INDEX/migration dir) — not placeholders but lookups; every task names concrete files, the mirror-source file, and expected test cases.
- **Type consistency:** `secondsUntilNextVerify`, `VerifyCellVerdict{row,column,correct}`, `VerifyGridRequest{cells:[{row,column,letter}]}`, `AssistMode`, `ACTIVE_ASSIST_MODE`, `useGridVerification`, `useAssistGate` used identically across Phases 2–4.
