# Regenerating hint budget (solo)

- **Date:** 2026-06-30
- **Bounded contexts:** `grid/` (api + application + infrastructure), `frontend/`
- **Status:** design approved, plan pending

## Problem

Solo grids validate as a single whole-grid binary verdict — "valid" or "pas
encore" — with no per-cell feedback (deliberate, to keep solo hard). The failure
mode that prompted this: a player fills the entire grid, gets *"pas tout à fait
juste"*, and has no idea **where** they went wrong. The two errors can sit on
**uncrossed cells** (word-starts with no crossing letter to disambiguate), where
a defensible answer — e.g. `NNO` vs the canonical `ONO` for "Cap vers la
Bretagne" — is rejected with zero guidance. The player is stuck with no path
forward.

The existing escape hatch is the whole-word reveal hint, but its budget is a
**fixed, one-way counter**: once spent, it never comes back. A player who burns
their hints early and later stalls has no recourse.

## Goal

Make the hint budget **regenerate over time** so a stalled player always has a
path forward, while keeping it rate-limited enough to stay fair (no hint-rushing
a fresh puzzle). Concretely: a token bucket of **capacity 3**, **+1 every 10
minutes**, **starting full**. Plus the minimum UI to make the regeneration
legible — otherwise it's invisible.

## Non-goals

- No change to **what** a hint does (it still reveals the focused word / cell —
  this spec is orthogonal to the reveal-cell-vs-word question and composes with
  either baseline). No letters added to any other response — ADR-0076 untouched.
- No change to **minigame** or **coop** — they don't use this budget.
- No new "word-check" / per-cell-locate affordance (considered, dropped in favor
  of regenerating the existing reveal).
- No "only on filled grids" gating — hints stay usable anytime, as today. The
  *regeneration* is the unstuck, not a new availability rule.
- No change to the cap value (already **3**, `DEFAULT_HINTS_ALLOWED`).

## Current state (verified against code)

- Budget is a **fixed per-puzzle cap** `Puzzle.hintsAllowed` (default **3** —
  `LoadOrGeneratePuzzleUseCase.DEFAULT_HINTS_ALLOWED`) with a **monotonic**
  `hints_used` counter per `(puzzle, user)`. It never refills.
- `HintUsageRepository`
  (`grid/application/.../puzzle/HintUsageRepository.kt`): `trySpend(conn,
  puzzleId, userId, hintsAllowed)` atomically increments `hints_used` if below
  cap, returns the new count or `null` (→ 429); `usedFor(puzzleId, userId)`
  reads the count for the read path; `deleteByUser` for GDPR erasure.
- Postgres adapter
  (`grid/infrastructure/.../persistence/PostgresHintUsageRepository.kt`):
  `INSERT … ON CONFLICT (puzzle_id, user_id) DO UPDATE` under a
  `pg_advisory_xact_lock`. In-memory twin
  (`InMemoryHintUsageRepository.kt`).
- Table `puzzle_hint_usage` (migrations `V2`, user_id added in `V6`); columns are
  `(puzzle_id, user_id, hints_used)`. **Next free migration: `V7`.**
- Reveal use case (`RevealCellHintUseCase.kt`) returns `hintsRemaining =
  hintsAllowed - usedAfter`.
- Read path embeds `hintsRemaining` on the puzzle response
  (`PuzzleResponse.kt:46-47`; computed in `PuzzleRoute.kt:126` and `:279`).
  **Anonymous callers** (no session) are not persisted and receive
  `hintsRemaining = hintsAllowed` (openapi.yaml:66-68).
- Frontend hint UI: `HintControl.tsx` + `useHintRequest.ts`; `hintsRemaining`
  flows from the puzzle read and the reveal response.

## Design

### A. Token bucket (server-authoritative)

Replace the monotonic counter with a token bucket per `(puzzle, user)`:

- **Capacity** = `Puzzle.hintsAllowed` (3). **Refill** = 1 token per
  `REFILL_INTERVAL` (**10 min**). **Initial** = full (capacity).
- State per row: `tokens_remaining INT`, `refill_anchor TIMESTAMPTZ`.
- On every spend/read, compute against the **server clock** (Postgres `now()` —
  immune to client clock, reload, app-close; rides ADR-0075 sync for free since
  it's server-side):

  ```
  elapsed   = now() - refill_anchor
  regen     = floor(elapsed / REFILL_INTERVAL)          // whole intervals only
  tokens    = min(capacity, tokens_remaining + regen)
  if regen > 0:
      refill_anchor = refill_anchor + regen * REFILL_INTERVAL   // keep remainder
  if tokens == capacity:
      refill_anchor = now()                              // full bucket: clock idle
  ```

  Preserving the remainder (not resetting to `now()` on partial elapse) means
  rapid spends don't push the next refill further out. Resetting the anchor at
  cap means the 10-min window starts from the spend that drops you below cap, not
  from some stale timestamp.

- **Spend** (`trySpend`): run the refill, then if `tokens ≥ 1` decrement and
  persist `(tokens, refill_anchor)`, returning the new `tokens`; else return
  `null` → 429.
- **Read** (new method, e.g. `budgetFor`): run the refill read-only and return
  `{ tokensRemaining, secondsUntilNextHint }` where
  `secondsUntilNextHint = null` at cap, else
  `ceil((refill_anchor + REFILL_INTERVAL - now()) seconds)`. Used by the read
  path so the UI can show a countdown without spending.
- Keep the `pg_advisory_xact_lock` discipline (spend mutates under the caller's
  lock; the read may run lock-free).
- A brand-new `(puzzle, user)` with no row reads as **full** (lazy-init:
  `tokens = capacity`, `secondsUntilNextHint = null`); the row is created on
  first spend.
- **Anonymous callers** (unchanged): no persistence → always full,
  `secondsUntilNextHint = null`.

### B. Wire (schema-first)

`grid/api/openapi.yaml`:

- Add `secondsUntilNextHint: integer` (**`required` + `nullable: true`** — always
  present on the wire, `null` when the bucket is full and for anonymous callers;
  ADR-0003 §6, precedent `GameSession.completedAt`) to:
  - the puzzle read response (alongside `hintsRemaining`), and
  - `RevealCellHintResult` (so the client gets a fresh countdown right after a
    spend).
- One-line description note: regeneration is server-clock; `null` means the
  bucket is full.
- No letters added anywhere — the daily answers-off-the-wire posture (GET letter
  omission, PR #218) is untouched by the hint budget.

### C. Migration (expand-and-contract)

`V7__puzzle_hint_usage_token_bucket.sql`:

- Add `tokens_remaining INT` and `refill_anchor TIMESTAMPTZ`.
- Backfill existing rows: `tokens_remaining = max(0, <capacity> - hints_used)`,
  `refill_anchor = now()`. (Capacity is 3 today; the backfill uses the literal
  3, matching `DEFAULT_HINTS_ALLOWED`, with a one-line comment.)
- Keep `hints_used` for one release (contract step drops it later) so a rollback
  to the previous image still reads.

### D. Frontend — one discreet regen timer

A **single** rule drives the whole UI: **whenever `tokens < capacity`, show a
discreet cooldown timer** on the hint affordance; at cap, show nothing extra
(just `3/3`). No separate states for "below cap" vs "empty" — `0/3` is the same
timer, with the button disabled.

- **Discreet cooldown indicator:** a subtle progress treatment on the hint
  control that fills over the 10-min interval — e.g. a thin radial ring around
  the hint icon (game-style ability cooldown) or an equivalently quiet progress
  hint — completing the instant the next token lands (`2/3 → 3/3`). It reads as
  "recharging" without a banner. The count badge (`2/3`) sits with it; the
  literal `+1 dans 6:42` is optional/secondary, kept quiet (e.g. on hover/focus
  or as small text), since the brief is **discreet**.
- **Empty (`0/3`):** the button is disabled and shows the same cooldown timer —
  the ring/countdown *is* the "next hint is coming" signal. No verbose sentence.
- **Mechanics:** a client-side ticker seeded from `secondsUntilNextHint` drives
  the indicator for display only; the **server stays source of truth** — the
  count actually increments on the next puzzle read or reveal response. When the
  ticker reaches 0, optimistically re-enable the button (server confirms via the
  next reveal/refetch; a 429 is authoritative).
- All copy **tutoiement**. The cooldown carries an accessible label +
  `role="status"` / `aria-live="polite"` (ADR-0050) so the regen state is
  announced even though it's visually discreet.
- **Dropped from this rollout:** the first-spend inline note and the Aide + tour
  copy. Cheap fast-follows if wanted later; not in scope here.

### E. Untouched

- Minigame (`MiniGame.tsx`), coop (`LiveCoopScreen`) — no budget, no change.
- The reveal mechanism itself (cell or word) — orthogonal.
- ADR-0076 answer-on-wire posture — no letters added.

## Rollout (schema-first, plan-as-waves — ADR-0001 §3, ADR-0003)

1. **Wave 1 — schema-only PR** (`grid/api/openapi.yaml`): add
   `secondsUntilNextHint` to the puzzle read response and `RevealCellHintResult`.
   Gate: `openapi-lint`. Bundle this design doc.
2. **Wave 2 — grid backend**: `V7` migration; token-bucket `trySpend` +
   `budgetFor` in both `HintUsageRepository` adapters; use case + read path return
   `secondsUntilNextHint`. TDD for the bucket math (refill, remainder, cap-idle,
   lazy-init, 429). Gate: `ci`, Konsist.
3. **Wave 3 — frontend**: `pnpm api:check` regen; one discreet regen cooldown on
   the hint control (shown whenever `tokens < capacity`, button disabled at
   `0/3`) in `HintControl` / `useHintRequest`; tests + a11y. Gates: frontend
   build, vitest, e2e, a11y, `openapi-typescript-drift`.

Each wave is fully reviewed and merged before the next starts.

## Risks / open edges

- **Clock source:** a single **injected `java.time.Clock`** supplies one
  `Instant` per request, passed into the use case and both repository adapters,
  so refill + spend share one timestamp and the bucket math is unit-testable
  without a DB. The pure bucket calculation lives in a side-effect-free helper
  (`HintBudgetCalculator`) that both adapters call — Postgres and in-memory share
  identical logic. (API replicas are NTP-synced; per-replica skew is sub-second
  and below the 10-min granularity.)
- **Display drift:** the client ticker is cosmetic; if it drifts from the server
  it self-corrects on the next read/reveal. Never let the client grant a spend —
  the 429 is authoritative.
- **Remainder vs reset:** verify (test) that spending at t=0 and t=3min leaves
  the first refill at t=10min, not t=13min.
- **Backfill capacity literal:** the migration hardcodes 3; if `hintsAllowed`
  ever becomes per-puzzle/non-3, the backfill must read it. Acceptable today
  (single global default); noted so it isn't silently wrong later.
- **Contract step:** dropping `hints_used` is a later migration, not this one.
- **Not an answer-leak control, but ADR-0076 §7 is open — not settled:** the
  hint budget is **gameplay gating** (it paces how fast a player can ask for
  help), not a security boundary, and ADR-0076 is the separate **home-teaser
  anti-scrape** ADR. The daily answers-off-the-wire posture is the GET
  letter-omission (PR #218), which the hint endpoint does not touch at any
  budget. A regenerating bucket lets a patient player reveal more than
  `hintsAllowed` words over real time, but only on their **own** puzzle and
  only over many hours. That said, ADR-0076 §7 names this exact endpoint
  (`/v1/puzzles/{id}/hints`) as "the one explicitly sanctioned exception" and
  bases the carve-out on `Puzzle.hintsAllowed` being a one-way, lifetime cap —
  language this design's regenerating bucket directly contradicts. This spec's
  "gameplay gating, not a security boundary" framing is this PR's position,
  not a settled resolution of that conflict — it needs explicit maintainer
  sign-off, or a §7 amendment, **before Wave 2** implements `trySpend`/
  `budgetFor`. See the Wave 2 blocking precondition in the plan.
