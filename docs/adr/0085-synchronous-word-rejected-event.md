# ADR-0085: Synchronous wrong-word feedback via a `wordRejected` event

## Status

Proposed

## Context

ADR-0084 restored multiplayer co-op word-locking: game-api validates a
just-completed word against grid and, when correct, broadcasts `wordLocked` so
every client renders the word as solved — synchronously, one round-trip after
the last letter.

Wrong completions emit nothing (`game/api/asyncapi.yaml`'s `WordLocked`
message description, written under ADR-0084's rollout: "incorrect completions
emit no event"). So the frontend's wrong-word "shake" (ADR-0084 Phase 5, PR
#1243) is driven **client-side** off the "checking…" pulse **timeout** (`useCoopValidating`,
`MAX_MS = 3500`): if a completed word is not locked within 3.5 s, the client
assumes it was wrong and shakes. That is laggy (a fixed 3.5 s wait for negative
feedback while the positive path is instant) and can mis-fire (a correct lock
that is merely slow, or a dropped `wordLocked`, shakes a correct word).

The maintainer wants the shake to be **synchronous, exactly like the lock** —
driven by the server verdict on the same round-trip, not by a timeout.

## Decision

### 1. New server→client `wordRejected` event

game-api emits `wordRejected { type, positions, rejectedAt }` when a candidate
word (fully filled, containing the just-written cell, not already locked)
validates as **incorrect** (grid `validate-word` → `correct: false`). It is the
exact mirror of `wordLocked` and is broadcast to the lobby the same way.

`UpdateCellUseCase` already calls the validator per candidate word; today it
locks the correct ones and drops the incorrect ones silently. It now also
collects the incorrect ones and emits `wordRejected` for their positions.

### 2. The frontend shake becomes server-driven

On `wordRejected`, the client clears the word's "checking…" pulse and shakes its
cells immediately (feeds `PuzzleBoard`'s existing `rejectingPositions`). The
pulse **timeout** is demoted to a pure safety-clear — it no longer produces a
shake. Result: fill a word → brief pulse → **lock (correct) or shake (wrong)**,
both synchronous and server-authoritative.

### 3. Reverses the `WordLocked` "no wrong-word event" description

The `game/api/asyncapi.yaml` `WordLocked` message description's "incorrect
completions emit no event" (written under ADR-0084's rollout) is reversed
**only** for the co-op multiplayer path. Grid's client-facing `/validate`
binary oracle and its solo posture (ADR-0076 §9) are untouched.

## Threat model — why this leaks nothing

- The event carries only `positions` (the cells the player **themselves** just
  filled — they already know them) plus a timestamp. **No letter, no canonical
  answer, no "which cell is wrong" data** — it is a whole-word "this attempt is
  wrong" bit for a word the player just completed.
- "Filled-but-not-locked = wrong" is **already inferable** by any client watching
  the shared grid (a completed word that never locks is wrong). `wordRejected`
  only makes explicit, sooner, what the lock/no-lock signal already reveals over
  time. It is not a per-cell oracle and cannot be used to probe the solution
  (unlike the per-cell `incorrectCells` that ADR-0076 removed from `/validate`).
- It does not touch grid's `/validate` (still binary) or `validate-word` (still
  token-gated, server-to-server). ADR-0076's anti-cheat property for solo/teaser
  is fully preserved.

## Consequences

### Easier
- Wrong-word feedback is instant and reliable (no 3.5 s wait, no false shake on a
  slow/dropped lock). Lock and reject are a symmetric server-authoritative pair.

### Harder
- One more event type end-to-end (asyncapi message, `LobbyEvent`, wire DTO,
  mapper, frontend event + handler, mock).

### Different
- `wordRejected` is **broadcast** (symmetric with `wordLocked`), so every client
  receives it and shakes those cells. Scoping the shake to only the player who
  typed the word (matching the local "checking…" pulse) is a possible refinement;
  broadcast was chosen for symmetry with `wordLocked` and simplicity. Revisit if
  a teammate's wrong attempt shaking on everyone's grid proves distracting.

## Rollout (schema-first)

1. **This ADR.** Update `docs/adr/INDEX.md`.
2. **Schema (game asyncapi):** add the `wordRejected` message + `WordRejectedPayload`;
   update the now-stale "incorrect completions emit no event" sentence in
   `WordLocked`'s description.
3. **game-api:** emit `LobbyEvent.WordRejected` on incorrect candidate words; map
   + broadcast.
4. **frontend:** add the `wordRejected` event; `useCoopValidating` shakes on it
   and demotes the timeout to safety-clear.

## Relationships

- **Extends ADR-0084** (co-op word-locking), completing its Phase-5 shake as a
  synchronous, server-authoritative signal.
- **Reverses** the `WordLocked` message description's "no wrong-word event"
  sentence in `game/api/asyncapi.yaml` (written under ADR-0084's rollout) for
  the co-op path only. ADR-0076 §9 (grid's `/validate` binary oracle) is a
  separate, untouched decision.
