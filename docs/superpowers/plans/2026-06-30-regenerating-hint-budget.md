# Regenerating Hint Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this repo dispatches each wave as
> one PR via the `dispatch` skill (worktree-isolated implementer → §6a review →
> merge → next wave). Steps use checkbox (`- [ ]`) syntax for tracking. Within a
> wave, follow TDD: failing test first, then implementation.

**Goal:** Turn the fixed, one-way solo hint budget into a regenerating token
bucket (capacity 3, +1 every 10 min, starts full) and surface a single discreet
regen cooldown on the hint control.

**Architecture:** Schema-first across three sequential PRs. Wave 1 adds
`secondsUntilNextHint` to the grid contract. Wave 2 replaces the monotonic
`hints_used` counter with a token bucket: a pure `HintBudgetCalculator` (unit-
tested, no I/O), a `V7` migration, both repository adapters, and the use case +
read path returning the regen countdown. Wave 3 regenerates frontend types and
renders the discreet cooldown. Each wave is fully reviewed and merged before the
next starts.

**Tech Stack:** Kotlin 2.3.21 + Ktor (grid api/application/infrastructure),
kotlinx-serialization, Postgres + Flyway, JUnit5 + AssertJ + Kotest property
tests + Testcontainers; Vite + React 19 + TS + Panda CSS + Ark UI (frontend);
Vitest + Playwright; openapi-typescript codegen.

**Spec:** `docs/superpowers/specs/2026-06-30-regenerating-hint-budget-design.md`

## Global Constraints

- Schema-only PR first; no implementation in Wave 1 (ADR-0001 §3, ADR-0003).
- 400-line diff cap per PR (excl. generated code) — invoke the standing override
  with justification if a wave legitimately exceeds it.
- Conventional commits, bounded-context scope, `-s` sign-off; branch
  `<type>/<desc>`.
- French copy uses **tutoiement** ("tu", never "vous").
- No `println` / `console.log`; structured logs only.
- Comments: one line, non-obvious *why* only; no multi-line blocks.
- TDD for domain/application logic; mock only at external boundaries (never mock
  a class we wrote — use the in-memory repo).
- Frontend letters live in the DOM (ADR-0002 uncontrolled inputs).
- Capacity stays **3** (`LoadOrGeneratePuzzleUseCase.DEFAULT_HINTS_ALLOWED`);
  refill interval is **10 min**. No letters added to any response (ADR-0076).
- Scope is **solo** hint budget only; minigame (`MiniGame.tsx`) and coop
  (`LiveCoopScreen`) are untouched.

---

## Wave 1 — Schema-only PR (`grid/api/openapi.yaml`)

**Branch:** `feat/grid-hint-regen-schema` · **Scope:** `feat(api-grid):`
**Gate:** `openapi-lint`. Bundle the spec doc with this PR.
**Pre-read:** `scripts/adr-context.sh grid/api/openapi.yaml` (ADR-0076 answer-on-wire).

### Task 1.1: Add `secondsUntilNextHint` to the contract

**Files:**
- Modify: `grid/api/openapi.yaml` — `Puzzle` response schema + `RevealCellHintResult`.
- Add: spec doc to the PR.

**Interfaces:**
- Produces: `secondsUntilNextHint: integer, nullable: true` on both the puzzle
  read response and `RevealCellHintResult`. Semantics: seconds until the next
  token regenerates; `null`/absent when the bucket is full (and always for
  anonymous callers).

- [ ] **Step 1:** In the `Puzzle` schema, add property
  `secondsUntilNextHint: { type: integer, nullable: true, description: "Secondes
  avant la régénération du prochain indice ; null si le quota est plein." }`. Do
  NOT add it to `required` (nullable/omitted when full).
- [ ] **Step 2:** In `RevealCellHintResult`, add the same `secondsUntilNextHint`
  property (not required).
- [ ] **Step 3:** Update the `hints` tag / operation description: the budget now
  regenerates (1 token / 10 min, cap = `hintsAllowed`); `secondsUntilNextHint`
  carries the countdown. Keep the one-line note that no canonical letters are
  added (ADR-0076 unchanged).
- [ ] **Step 4:** `cd frontend && pnpm api:check` to confirm the spec parses and
  regenerates without error (do NOT commit the regen — that's Wave 3).
- [ ] **Step 5:** Commit:
  `feat(api-grid): add secondsUntilNextHint for regenerating hint budget`

**Wave 1 done when:** `openapi-lint` green, §6a LGTM, merged.

---

## Wave 2 — grid backend (`grid/application`, `grid/infrastructure`, `grid/api`)

**Branch:** `feat/grid-hint-regen-backend` · **Scope:** `feat(grid-application):` / `feat(grid-infrastructure):`
**Gate:** `ci` (Gradle build, tests, Spotless, Konsist).
**Pre-read:** `scripts/adr-context.sh grid/application/puzzle/HintUsageRepository.kt grid/api/src/main/resources/db/migration/ grid/api/routes/PuzzleRoute.kt`

### Task 2.1: Pure token-bucket calculator (TDD)

**Files:**
- Create: `grid/application/src/main/kotlin/com/bliss/grid/application/puzzle/HintBudgetCalculator.kt`
- Test: `grid/application/src/test/kotlin/com/bliss/grid/application/puzzle/HintBudgetCalculatorTest.kt`

**Interfaces:**
- Produces:
  ```kotlin
  object HintBudgetCalculator {
      data class State(val tokens: Int, val anchor: Instant?)        // anchor null = never spent (full)
      data class View(val tokensRemaining: Int, val secondsUntilNextHint: Long?)
      fun refill(state: State, now: Instant, capacity: Int, interval: Duration): State
      fun view(state: State, now: Instant, capacity: Int, interval: Duration): View
      fun spend(state: State, now: Instant, capacity: Int, interval: Duration): State?  // null = no token (429)
  }
  ```

- [ ] **Step 1 (RED):** Write `HintBudgetCalculatorTest` covering, with
  `capacity=3`, `interval=Duration.ofMinutes(10)`, `t0=Instant.parse("2026-06-30T00:00:00Z")`:
  ```kotlin
  // never-spent reads full, no countdown
  view(State(3, null), t0, 3, ten) == View(3, null)
  // spend from full → 2, anchor=now, next in 600s
  spend(State(3, null), t0, 3, ten) == State(2, t0)
  view(State(2, t0), t0, 3, ten) == View(2, 600)
  // partial spend keeps in-flight progress: spend at +3min leaves next at +10min, not +13min
  spend(State(2, t0), t0.plusSeconds(180), 3, ten) == State(1, t0)        // anchor unchanged
  view(State(1, t0), t0.plusSeconds(180), 3, ten) == View(1, 420)         // 600-180
  // regen across whole intervals only; remainder preserved
  view(State(0, t0), t0.plusSeconds(1500), 3, ten) == View(2, 300)        // 2 regen, next at +30min
  // regen to cap clamps and clears countdown
  view(State(0, t0), t0.plusSeconds(99999), 3, ten) == View(3, null)
  // spend when empty (no regen yet) → null
  spend(State(0, t0), t0.plusSeconds(60), 3, ten) == null
  // empty but a token regenerated → spend succeeds, drops back, anchor advanced one interval
  spend(State(0, t0), t0.plusSeconds(650), 3, ten) == State(0, t0.plusSeconds(600))
  // clock skew backwards → no negative regen
  view(State(1, t0), t0.minusSeconds(60), 3, ten) == View(1, 600)
  ```
  Also a Kotest property test: `tokensRemaining` is always in `0..capacity` for
  arbitrary `(tokens in 0..capacity, anchor, now)`.
- [ ] **Step 2:** Run: `./gradlew :grid:application:test --tests '*HintBudgetCalculatorTest*'` — expect RED (unresolved reference).
- [ ] **Step 3 (GREEN):** Implement `HintBudgetCalculator`:
  ```kotlin
  package com.bliss.grid.application.puzzle

  import java.time.Duration
  import java.time.Instant

  /** Pure token-bucket math for the regenerating hint budget; caller supplies [now] (no clock, no I/O). */
  object HintBudgetCalculator {
      data class State(val tokens: Int, val anchor: Instant?)
      data class View(val tokensRemaining: Int, val secondsUntilNextHint: Long?)

      fun refill(state: State, now: Instant, capacity: Int, interval: Duration): State {
          if (state.tokens >= capacity) return State(capacity, now)
          val anchor = state.anchor ?: return State(capacity, now)
          val elapsed = Duration.between(anchor, now)
          if (elapsed.isNegative || elapsed.isZero) return state
          val regen = (elapsed.seconds / interval.seconds).toInt()
          if (regen <= 0) return state
          val tokens = minOf(capacity, state.tokens + regen)
          return if (tokens >= capacity) State(capacity, now)
          else State(tokens, anchor.plusSeconds(regen * interval.seconds))
      }

      fun view(state: State, now: Instant, capacity: Int, interval: Duration): View {
          val r = refill(state, now, capacity, interval)
          val anchor = r.anchor
          if (r.tokens >= capacity || anchor == null) return View(r.tokens, null)
          val next = anchor.plus(interval)
          val ms = Duration.between(now, next).toMillis()
          val secs = if (ms <= 0) 0L else (ms + 999) / 1000   // ceil to whole seconds
          return View(r.tokens, secs)
      }

      fun spend(state: State, now: Instant, capacity: Int, interval: Duration): State? {
          val r = refill(state, now, capacity, interval)
          if (r.tokens <= 0) return null
          return State(r.tokens - 1, r.anchor ?: now)
      }
  }
  ```
- [ ] **Step 4:** Run the test → GREEN. Then `./gradlew :grid:application:spotlessApply`.
- [ ] **Step 5:** Commit: `feat(grid-application): pure token-bucket hint calculator`

### Task 2.2: Migration `V7` — token-bucket columns

**Files:**
- Create: `grid/api/src/main/resources/db/migration/V7__puzzle_hint_usage_token_bucket.sql`
- Create (test mirror): `grid/infrastructure/src/test/resources/db/migration/V7__puzzle_hint_usage_token_bucket.sql` (identical — Testcontainers Flyway reads this copy)

**Interfaces:**
- Produces: `puzzle_hint_usage` gains `tokens_remaining INT NOT NULL` and
  `refill_anchor TIMESTAMPTZ NOT NULL`; `hints_used` retained (dropped in a later
  contract migration).

- [ ] **Step 1:** Write the migration (same bytes in both locations):
  ```sql
  -- Expand step: turn the monotonic hints_used counter into a token bucket.
  -- Capacity 3 mirrors LoadOrGeneratePuzzleUseCase.DEFAULT_HINTS_ALLOWED; hints_used
  -- is kept this release so a rollback to the prior image still reads (contract later).
  ALTER TABLE puzzle_hint_usage
      ADD COLUMN tokens_remaining INT         NOT NULL DEFAULT 3 CHECK (tokens_remaining >= 0),
      ADD COLUMN refill_anchor    TIMESTAMPTZ NOT NULL DEFAULT now();

  UPDATE puzzle_hint_usage
      SET tokens_remaining = GREATEST(0, 3 - hints_used),
          refill_anchor    = now();
  ```
- [ ] **Step 2:** Run the infra module tests (they boot Flyway against
  Testcontainers): `./gradlew :grid:infrastructure:test --tests '*HintUsage*'`
  — expect existing tests still compile/migrate (RED only where Task 2.3 changes
  the repo). If Flyway validation fails on a checksum, confirm both file copies
  are byte-identical.
- [ ] **Step 3:** Commit: `feat(grid-infrastructure): V7 hint-usage token-bucket columns`

### Task 2.3: Repository port + both adapters (TDD)

**Files:**
- Modify: `grid/application/.../puzzle/HintUsageRepository.kt`
- Modify: `grid/infrastructure/.../persistence/PostgresHintUsageRepository.kt`
- Modify: `grid/infrastructure/.../persistence/InMemoryHintUsageRepository.kt`
- Test: `grid/infrastructure/.../persistence/PostgresHintUsageRepositoryTest.kt`
  (Testcontainers) and the in-memory twin test (add if absent)

**Interfaces:**
- Produces (port):
  ```kotlin
  interface HintUsageRepository {
      // Atomic spend on the caller's advisory-locked [conn]; returns post-spend view, or null at 429.
      fun trySpend(conn: Connection, puzzleId: UUID, userId: UUID,
                   capacity: Int, interval: Duration, now: Instant): HintBudgetCalculator.View?
      // Read-only budget (own connection); absent row = full.
      fun budgetFor(puzzleId: UUID, userId: UUID,
                    capacity: Int, interval: Duration, now: Instant): HintBudgetCalculator.View
      fun deleteByUser(userId: UUID): Int   // unchanged (GDPR)
  }
  ```
  (`usedFor` is removed — `budgetFor` replaces it.)

- [ ] **Step 1 (RED):** In `PostgresHintUsageRepositoryTest`, replace the
  monotonic-counter assertions with bucket behavior, injecting `now` explicitly:
  ```kotlin
  val now = Instant.parse("2026-06-30T12:00:00Z"); val ten = Duration.ofMinutes(10)
  // fresh (puzzle,user): budgetFor is full
  repo.budgetFor(pid, uid, 3, ten, now) == View(3, null)
  // three spends drain to 0, then 429
  repo.trySpend(conn, pid, uid, 3, ten, now) == View(2, 600)
  repo.trySpend(conn, pid, uid, 3, ten, now) == View(1, 600)
  repo.trySpend(conn, pid, uid, 3, ten, now) == View(0, 600)
  repo.trySpend(conn, pid, uid, 3, ten, now) == null
  // 10 min later one token is back
  repo.budgetFor(pid, uid, 3, ten, now.plusSeconds(600)) == View(1, 600)
  repo.trySpend(conn, pid, uid, 3, ten, now.plusSeconds(600)) == View(0, 600)
  ```
  Mirror the same cases in the in-memory twin test.
- [ ] **Step 2:** Run: `./gradlew :grid:infrastructure:test --tests '*HintUsageRepository*'` — expect RED (signature/columns changed).
- [ ] **Step 3 (GREEN — port):** Update `HintUsageRepository`: replace `trySpend`
  signature, replace `usedFor` with `budgetFor` (signatures above); keep
  `deleteByUser`. Import `HintBudgetCalculator`, `java.time.Duration/Instant`.
- [ ] **Step 4 (GREEN — Postgres):** Implement against the new columns. `trySpend`
  (runs under the caller's advisory lock):
  - `SELECT tokens_remaining, refill_anchor FROM puzzle_hint_usage WHERE puzzle_id=? AND user_id=?`
    → `State(tokens, anchor)`; absent → `State(capacity, null)`.
  - `val next = HintBudgetCalculator.spend(state, now, capacity, interval) ?: return null`
  - `INSERT INTO puzzle_hint_usage (puzzle_id, user_id, tokens_remaining, refill_anchor, updated_at)
     VALUES (?,?,?,?, ?) ON CONFLICT (puzzle_id, user_id) DO UPDATE
     SET tokens_remaining = EXCLUDED.tokens_remaining, refill_anchor = EXCLUDED.refill_anchor, updated_at = EXCLUDED.updated_at`
    binding `next.tokens`, `next.anchor` (non-null after spend), `Timestamp.from(now)`.
  - return `HintBudgetCalculator.view(next, now, capacity, interval)`.
  `budgetFor`: own connection, SELECT the row → State (absent → `State(capacity, null)`),
  return `HintBudgetCalculator.view(state, now, capacity, interval)` (no write).
  Store/read `refill_anchor` as `Timestamp`/`Instant` via `getObject(..., OffsetDateTime::class.java).toInstant()`.
- [ ] **Step 5 (GREEN — in-memory):** Back it with
  `ConcurrentHashMap<Pair<UUID,UUID>, HintBudgetCalculator.State>`; `trySpend`
  computes `spend(...)` under a per-key `synchronized`/`compute`, stores the new
  state, returns its `view`; absent → `State(capacity, null)`. `budgetFor` returns
  `view` of the stored (or full) state. `deleteByUser` unchanged.
- [ ] **Step 6:** Run both repo tests → GREEN. `./gradlew :grid:infrastructure:test`
  then `:grid:application:test` (Konsist arch tests live here).
- [ ] **Step 7:** `./gradlew spotlessApply`. Commit:
  `feat(grid-infrastructure): regenerating token-bucket hint repository`

### Task 2.4: Use case + read path return the countdown

**Files:**
- Modify: `grid/application/.../puzzle/RevealCellHintUseCase.kt`
- Modify: `grid/api/.../dto/PuzzleResponse.kt` and the hint result DTO
  (`RevealCellHintResult` in `grid/api/.../dto/RevealCellHintDto.kt`)
- Modify: `grid/api/.../mapper/GridToPuzzleMapper.kt` (`toApi` adds the field)
- Modify: `grid/api/.../routes/PuzzleRoute.kt` (`remainingHintsFor` → budget view; two read paths + hint handler)
- Modify: `grid/api/.../Module.kt` (inject a `Clock` into `RevealCellHintUseCase`)
- Test: `RevealCellHintUseCaseTest` + a `PuzzleRoute` hint/read test if present

**Interfaces:**
- Consumes: `HintUsageRepository.{trySpend,budgetFor}`, `HintBudgetCalculator.View`,
  injected `java.time.Clock`, constant `HINT_REFILL_INTERVAL = Duration.ofMinutes(10)`.
- Produces: `RevealCellHintOutcome.Granted` gains `secondsUntilNextHint: Long?`;
  `RevealCellHintResult` and `PuzzleResponse` gain `secondsUntilNextHint: Int? = null`.

- [ ] **Step 1 (RED):** Update `RevealCellHintUseCaseTest`: the use case now takes
  a fixed `Clock`; a spend returns `Granted(hintsRemaining=2, secondsUntilNextHint=600)`
  from a full bucket; the third drains to `0` with `secondsUntilNextHint=600`; a
  fourth → `BudgetExhausted`. Use the in-memory repo (no mocks).
- [ ] **Step 2:** Run: `./gradlew :grid:application:test --tests '*RevealCellHintUseCaseTest*'` — RED.
- [ ] **Step 3 (GREEN):** In `RevealCellHintUseCase`: add `clock: Clock = Clock.systemUTC()`
  ctor param and `companion { val HINT_REFILL_INTERVAL = Duration.ofMinutes(10) }`.
  Replace the `trySpend(conn, puzzleId, userId, puzzle.hintsAllowed)` call with
  `trySpend(conn, puzzleId, userId, puzzle.hintsAllowed, HINT_REFILL_INTERVAL, clock.instant())`;
  on `null` → `BudgetExhausted`; else build `Granted(row, column, letter,
  hintsRemaining = view.tokensRemaining, secondsUntilNextHint = view.secondsUntilNextHint)`.
  Add `secondsUntilNextHint: Long?` to `Granted`.
- [ ] **Step 4 (GREEN — DTOs/mapper):** Add `secondsUntilNextHint: Int? = null` to
  `PuzzleResponse` and `RevealCellHintResult`. Add a `secondsUntilNextHint: Int?`
  param to `GridToPuzzleMapper.toApi`, passed into `PuzzleResponse`.
- [ ] **Step 5 (GREEN — route):** Change `remainingHintsFor` into `hintBudgetFor`
  returning `HintBudgetCalculator.View` (anonymous callers → `View(stored.hintsAllowed, null)`;
  authenticated → `hintUsageRepository.budgetFor(puzzleId, userId, stored.hintsAllowed,
  RevealCellHintUseCase.HINT_REFILL_INTERVAL, clock.instant())`). Both read paths
  pass `view.tokensRemaining` as `hintsRemaining` and `view.secondsUntilNextHint?.toInt()`
  as `secondsUntilNextHint` into `toApi`. The hint handler maps
  `outcome.secondsUntilNextHint?.toInt()` into `RevealCellHintResult`.
- [ ] **Step 6 (GREEN — wiring):** In `Module.kt`, pass a `Clock` (use the app's
  existing injected clock if one exists; else `Clock.systemUTC()`) to
  `RevealCellHintUseCase` and to the route's `hintBudgetFor` clock source.
- [ ] **Step 7:** `./gradlew :grid:application:test :grid:api:test` → GREEN; grep
  `usedFor` and `remainingHintsFor` across `grid/` and remove dead references;
  `spotlessApply`.
- [ ] **Step 8:** Commit: `feat(grid-application): hint reveal + read path expose regen countdown`

**Wave 2 done when:** `ci` green, §6a LGTM, merged.

---

## Wave 3 — frontend (`frontend/`)

**Branch:** `feat/frontend-grid-hint-regen` · **Scope:** `feat(frontend-grid):`
**Gates:** frontend build, vitest, e2e, a11y, `openapi-typescript-drift`.
**Pre-read:** `scripts/adr-context.sh frontend/src/ui/components/grid/` (ADR-0002, ADR-0050).

### Task 3.1: Regenerate API types

**Files:**
- Modify (generated): `frontend/src/infrastructure/api/grid/types.ts`

- [ ] **Step 1:** `cd frontend && pnpm api:check` against the merged Wave-1 spec.
  Commit the regen alone: `chore(api-grid): regenerate openapi types`. (Drift gate green.)

### Task 3.2: Thread `secondsUntilNextHint` through the hint client + hook

**Files:**
- Modify: `frontend/src/infrastructure/api/grid/HttpPuzzleSolver.ts` (hint reveal returns the field)
- Modify: `frontend/src/application/puzzle/PuzzleSolver.ts` (port type)
- Modify: `frontend/src/ui/components/grid/useHintRequest.ts`
- Test: `frontend/tests/...` hint hook spec

**Interfaces:**
- Consumes: reveal response `{ ..., hintsRemaining, secondsUntilNextHint }` and the
  puzzle read `{ ..., hintsRemaining, secondsUntilNextHint }`.
- Produces: `useHintRequest` exposes `{ hintsRemaining, secondsUntilNextHint }`
  (seconds may be `null` = full).

- [ ] **Step 1 (RED):** Test: after a successful reveal returning
  `{ hintsRemaining: 2, secondsUntilNextHint: 600 }`, the hook exposes both; when
  `secondsUntilNextHint` is `null`, the hook reports "full".
- [ ] **Step 2 (GREEN):** Add `secondsUntilNextHint: number | null` to the solver
  port + HTTP mapping; store it in `useHintRequest` state alongside `hintsRemaining`.
- [ ] **Step 3:** `pnpm test` (targeted) + `pnpm typecheck`.
- [ ] **Step 4:** Commit: `feat(frontend-grid): carry hint regen countdown through the hook`

### Task 3.3: Discreet regen cooldown in `HintControl`

**Files:**
- Modify: `frontend/src/ui/components/grid/HintControl.tsx`
- Possibly add: `frontend/src/ui/components/grid/useCountdownTicker.ts` (1-Hz display ticker)
- Test: `frontend/tests/...` HintControl spec

**Interfaces:**
- Consumes: `{ hintsRemaining, hintsAllowed, secondsUntilNextHint }`.
- Produces: a single discreet cooldown shown whenever `hintsRemaining < hintsAllowed`;
  at `hintsRemaining === 0` the reveal button is disabled but the cooldown remains.

- [ ] **Step 1 (RED):** Tests:
  - `hintsRemaining === hintsAllowed` (3/3): no cooldown element rendered; button enabled.
  - `0 < hintsRemaining < hintsAllowed` (e.g. 2/3) with `secondsUntilNextHint=600`:
    the discreet cooldown renders (a `[data-testid="hint-cooldown"]` with
    `role="status"`/`aria-live="polite"`); button still enabled.
  - `hintsRemaining === 0`: button disabled (`aria-disabled`); cooldown still rendered.
  - The display ticker counts down (`secondsUntilNextHint` 600 → ~599 after 1s with fake timers).
- [ ] **Step 2:** Run: `pnpm test src/ui/components/grid/HintControl` — RED.
- [ ] **Step 3 (GREEN):** Implement: when `hintsRemaining < hintsAllowed`, render
  the discreet cooldown (thin radial ring / quiet progress around the hint icon,
  driven by `secondsUntilNextHint` / interval; `+1 dans m:ss` kept quiet — e.g.
  secondary text or title). Seed a 1-Hz client ticker from `secondsUntilNextHint`
  for display only; on reaching 0, optimistically enable the reveal button
  (server confirms on next read/reveal; a 429 is authoritative — do not grant a
  spend client-side). Disable the button when `hintsRemaining === 0`, keeping the
  cooldown visible. All copy tutoiement; cooldown carries
  `role="status"` + `aria-live="polite"`.
- [ ] **Step 4:** `pnpm test` (targeted), `pnpm typecheck`.
- [ ] **Step 5:** Commit: `feat(frontend-grid): discreet regenerating-hint cooldown`

### Task 3.4: e2e + a11y

- [ ] **Step 1:** `pnpm e2e` for the solo hint flow (spend a hint → count drops,
  cooldown appears; at 0/3 the button disables, cooldown persists).
- [ ] **Step 2:** `pnpm a11y` — confirm the cooldown status is announced
  (`role="status"`/`aria-live`).
- [ ] **Step 3:** Commit any fixups: `test(frontend-grid): solo hint regen coverage`

**Wave 3 done when:** all frontend gates + `openapi-typescript-drift` green, §6a
LGTM, merged. Rollout complete.

## Self-review

- **Spec coverage:** token bucket (capacity 3, +1/10min, full start) → 2.1 +
  2.3; server-authoritative injected `Clock` → 2.1 (pure `now` param) + 2.4 (Clock
  injection); `secondsUntilNextHint` wire → 1.1 + 2.4; migration expand-and-contract
  (keep `hints_used`) → 2.2; anonymous = full/null → 2.4 Step 5; single discreet
  cooldown when `tokens < cap`, disabled at 0 → 3.3; minigame/coop untouched →
  Global Constraints + no files touched there; ADR-0076 (no letters) → 1.1 Step 3.
- **Dropped touchpoints** (first-spend note, Aide/tour copy) intentionally absent
  — matches the spec's 1+3-collapsed-to-one-discreet-timer decision.
- **Type consistency:** `HintBudgetCalculator.View(tokensRemaining, secondsUntilNextHint: Long?)`
  is the single return type for `trySpend`/`budgetFor`; the use case maps
  `secondsUntilNextHint` to `Int?` at the DTO boundary; `RevealCellHintOutcome.Granted`
  carries `Long?`. `HINT_REFILL_INTERVAL` is defined once on
  `RevealCellHintUseCase` and reused by the route.
- **Contract step** (drop `hints_used`) is explicitly deferred to a later
  migration, not this plan.
