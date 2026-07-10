# Grid Verification (replaces solo hints) — Design

**Date:** 2026-07-09
**Context:** `grid/` (solo puzzle API) + `frontend/` (solo play screen)
**Status:** Approved (brainstorming), pending implementation plan

## Problem

Solo puzzles currently offer a **hint** action: it reveals the entire
focused word, is fully server-authoritative (the answer key is kept off
the client per ADR-0076), and refills one of three tokens every 10
minutes. Revealing whole words is a strong assist that short-circuits the
puzzle.

We want to replace the solo assist with a **grid verification** action:
the player checks the letters they have entered so far, correct cells lock
(reusing the existing hint/co-op lock mechanic), wrong cells shake and
stay editable. Each verification starts a **30-minute per-puzzle
cooldown**, enforced server-side.

Hints are **not deleted** — the feature stays in the codebase but is
deactivated on solo grids, so a follow-up can expose "which assist mode is
active" as a lobby/game setting.

## Goals

- Solo play screen offers **Vérifier** instead of **Indice**.
- Verification acts on the currently-filled, not-yet-locked cells
  (partial grids allowed). Correct → lock; wrong → shake, stay editable;
  empty → ignored. A fully-correct verification completes the puzzle.
- 30-minute per-puzzle cooldown, **server-authoritative** (survives
  reloads, not bypassable by clearing localStorage or switching device).
- Per-cell correctness returned only for filled cells; no positional
  answer-key leak beyond that, with the cooldown as the rate-limit
  mitigation.
- Assist mode is read from a single seam (`'verify' | 'hint' | 'none'`),
  hardcoded to `'verify'` now, so lobby settings plug in later.
- Co-op / multiplayer flow is untouched.

## Non-goals

- Exposing the assist mode in lobby/game settings UI (follow-up).
- Removing the hint backend endpoint, use-case, or tables.
- Changing co-op word validation (`answerValidated` / `wordLocked`).
- Any per-cell correctness on the existing binary `/validate` endpoint.

## Approach

Chosen: **a new dedicated `POST /v1/puzzles/{id}/verify` endpoint**
(Approach A), keeping `/validate` (binary, uncapped) and `/hints`
(dormant) untouched. Rejected: overloading `/validate` with per-cell data
and a cooldown (Approach B) — it entangles a deliberately-binary,
uncapped endpoint with call sites (co-op, completion check) that must stay
on the binary path, adding regression risk for no gain. Three clean,
independently-toggleable server capabilities map directly onto the future
assist-mode setting.

## Architecture

### ADR (merges first)

Returning per-cell correctness softens ADR-0076's "answer key off the
wire" posture. It also directly contradicts
[ADR-0084](../../adr/0084-internal-word-validation-for-multiplayer.md)
§2: *"Solo grids never regain per-word or per-cell feedback. This ADR
does not reopen ADR-0076's posture for any client-facing surface."*
ADR-0084 is current (extended since by ADR-0085 and ADR-0086) and its
path registry entries (`docs/adr/INDEX.md` lines 214-218) cover exactly
`grid/api/openapi.yaml` and `grid/api/**/routes/PuzzleRoute.kt` — the
files Phases 2/3 of the implementation plan touch. This ADR is therefore
load-bearing here, not optional background reading.

This needs a short ADR that **explicitly amends/supersedes ADR-0084
§2** (not just ADR-0076 §§7-9), documenting:

- The reversal, named plainly: solo grids regain per-cell feedback via
  `/verify`, superseding ADR-0084 §2's "never" for this one endpoint.
  `/validate-word` (ADR-0084 §1, internal/service-authenticated) and the
  client-facing binary `/validate` (ADR-0084 §2, ADR-0076 §9) are
  otherwise unaffected.
- The new `/verify` capability returns per-cell `correct` booleans for
  filled cells only (never the canonical letter).
- The 30-minute per-puzzle cooldown is the named rate-limit mitigation
  against answer-key brute force (a uniform-letter sweep of the alphabet
  would take ~13 hours).
- `/validate` remains binary and uncapped; `/hints` remains as-is.
- A threat model in ADR-0084's shape (asset / attacker / surfaces /
  controls / residual risk), explicitly comparing the two leak surfaces:
  ADR-0084's `/validate-word` residual risk is "one bit per word,
  reachable only with a leaked service secret, which already presupposes
  cluster compromise"; `/verify`'s residual risk is a full solo solve in
  ~13h reachable by any authenticated browser client, no compromise
  required. The ADR must state plainly why that materially larger,
  directly-client-reachable surface is still acceptable (mirrors the
  spec's own "Risks / open questions" answer-key-leak note below, but the
  ADR is the binding artifact — this section is not a substitute for it).

Update `docs/adr/INDEX.md` in the same PR (registry-coherence gate),
including a row for the amended ADR-0084 §2 status.

### Backend (grid context) — schema-first

1. **Schema-only PR** adds to `grid/api/openapi.yaml`:
   - `POST /v1/puzzles/{puzzleId}/verify`
   - Request body: `{ "cells": [ { "row": int, "column": int, "letter": string } ] }`
     — the filled, unlocked cells the player wants checked.
   - `200`: `{ "cells": [ { "row": int, "column": int, "correct": bool } ], "secondsUntilNextVerify": int }`
   - `429` (cooldown active): `{ "secondsUntilNextVerify": int }` — **no**
     `cells` array, so an early call leaks nothing.
   - `400` invalid coordinates; `401` auth required (needs the identity
     session cookie, like `/hints`).
   - CI gate: `openapi-lint`, then `openapi-typescript-drift` on the
     consumer side.

2. **Backend implementation PR** (after schema merges):
   - `VerifyGridUseCase` in `grid/application/`, mirroring
     `RevealCellHintUseCase`: resolves the canonical letters server-side,
     compares against the submitted cells, returns per-cell verdicts.
   - `VerifyCooldownCalculator` in `grid/domain/`, mirroring
     `HintBudgetCalculator`: given `lastVerifiedAt` and now, returns
     `secondsUntilNextVerify` and whether the action is allowed. TDD,
     near-100% mutation coverage.
   - Persistence: a `puzzle_verify_usage` table keyed by
     `(user_id, puzzle_id)` holding `last_verified_at`, added via an
     **expand-and-contract** Flyway migration, mirroring
     `puzzle_hint_usage`. Retention cronjob mirrors
     `cronjob-hint-usage-retention.yaml`.
   - Route wiring in `PuzzleRoute.kt` + a `VerifyGridDto`, mirroring the
     hint DTO/route. 429 on cooldown.
   - Konsist arch tests stay green (no vendor imports in domain/app).

### Frontend (solo only) — after backend merges

- **Port:** add `verify(puzzleId, cells)` to the `PuzzleSolver`
  application port (`frontend/src/application/puzzle/PuzzleSolver.ts`),
  returning `{ cells: { row, column, correct }[], secondsUntilNextVerify }`
  or a typed cooldown error.
- **Adapter:** `HttpPuzzleSolver.verify` →
  `POST /v1/puzzles/{id}/verify` with `credentials: 'include'`, mapping
  `429 → cooldown-active`, `401 → auth-required`, else `transient`
  (mirrors the hint adapter's typed `HintRequestError` kinds).
- **Hook:** `useGridVerification` (modeled on `useHintRequest`): gathers
  filled unlocked cells from the DOM, calls `solver.verify`, locks correct
  cells via the existing lock/persist path (`soloEntriesStore` +
  `lockedCells`), fires a shake on wrong cells, owns cooldown state
  (`secondsUntilNextVerify`, `pending`, `lastResult`, `errorMessage`),
  resets on puzzle change.
- **Cooldown UI:** reuse `HintCooldown.tsx` + `useCountdownTicker.ts`,
  generalized (thin rename to `AssistCooldown`) seeded at **1800s**. The
  server value stays source of truth; the ticker is display-only.
- **Shake animation:** new Panda CSS keyframes on wrong cells. **Respects
  `prefers-reduced-motion` (ADR-0050):** reduced-motion falls back to a
  static wrong-state style (e.g. a brief non-animated outline), no motion.
- **Affordance:** `PlayScreen` swaps the hint chip for a **Vérifier**
  button, chosen by the assist-mode seam
  (`type AssistMode = 'verify' | 'hint' | 'none'`, hardcoded `'verify'`).
  `useHintGate` generalizes to `useAssistGate` (still requires
  auth/capability; keeps the anonymous/loading disabled states).
- **Copy (inline French literals — no i18n system exists yet):**
  - Button: `Vérifier`
  - Cooldown label: `+ vérification dans M:SS` (formatMmSs)
  - Cooldown SR status: `Nouvelle vérification disponible.`
  - 429 pill: `Vérification en cooldown`
  - 401 pill: `Connecte-toi pour vérifier ta grille`
  - transient pill: `Erreur, réessayez`

### Assist-mode seam

A single module exports `type AssistMode = 'verify' | 'hint' | 'none'`
and the current value (constant `'verify'`). `PlayScreen` branches on it to
render either the Vérifier affordance (wired to `useGridVerification`) or
the legacy hint chip (wired to `useHintRequest`, now dead on solo) or
nothing. No behavior change beyond selecting `'verify'`; the seam is the
documented extension point for lobby settings.

## Data flow

1. Player fills some cells, presses **Vérifier**.
2. Hook collects filled unlocked cells → `solver.verify(id, cells)`.
3. Server checks cooldown: if active, `429` → hook shows cooldown pill,
   starts/continues the ring.
4. Else server compares against canonical letters, records
   `last_verified_at = now`, returns per-cell `correct` +
   `secondsUntilNextVerify = 1800`.
5. Hook locks correct cells (persist + read-only + solve beat), shakes
   wrong cells, seeds the 30-min ticker.
6. If every letter cell is now locked, the puzzle is complete (existing
   completion path fires).

## Error handling

- `429` cooldown → non-destructive pill + visible ring; no grid change.
- `401` → "connecte-toi" pill; affordance already gated for anon by
  `useAssistGate`, this is the defensive server case.
- Network/5xx → transient "réessayez" pill, no grid change, no cooldown
  consumed (server only records on success).
- Empty submission (nothing filled/unlocked) → button disabled; no call.

## Testing

- **Backend:**
  - `VerifyCooldownCalculator`: TDD, property/edge tests around the 30-min
    boundary, near-100% mutation coverage.
  - Verify request/response serialization: property-based (per ADR-0001
    rule for serialization).
  - `VerifyGridUseCase`: per-cell verdict correctness; 429 gate when
    within cooldown; no `cells` leaked on 429.
- **Frontend:**
  - `useGridVerification`: lock-on-correct, shake-on-wrong, cooldown
    gating, reset-on-puzzle-change.
  - MSW `/verify` handler computing correctness from fixture solutions
    (mock layer already holds canonical letters).
  - a11y: shake respects `prefers-reduced-motion`; cooldown SR status
    announced (`pnpm a11y`).
- Regression: `/validate` and `/hints` paths unchanged; co-op untouched.

## PR sequencing (400-line cap, ADR-0001 §4)

1. **ADR** amending/relating to ADR-0076 and explicitly superseding
   ADR-0084 §2 (+ `docs/adr/INDEX.md`).
2. **Schema-only** PR: `/verify` in `grid/api/openapi.yaml`.
3. **Backend** PR: use-case + cooldown calculator + migration + route +
   retention cronjob + tests.
4. **Frontend** PR: port + adapter + `useGridVerification` +
   assist-mode seam + Vérifier affordance + shake + cooldown reuse +
   tests + regenerated `types.ts`.

Each PR is one workstream; co-op is untouched throughout. PRs 3 and 4 land
in parallel after PR 2 merges (schema-first workflow, ADR-0003).

## Risks / open questions

- **Answer-key leak surface:** per-cell correctness is more than binary.
  Mitigation is the 30-min cooldown; documented in the ADR. Acceptable
  because it is strictly less generous than today's 3-free-whole-words
  hint.
- **Cooldown granularity:** per-puzzle (verifying the daily does not lock
  an archive puzzle). Keyed by `(user_id, puzzle_id)`.
- **`user_id` for anonymous players:** hints already require auth
  (`useHintGate` / `401`), so verification inherits the same posture —
  auth required. Confirmed consistent with existing hint gating.
