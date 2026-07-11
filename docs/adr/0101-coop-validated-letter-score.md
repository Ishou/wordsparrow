# ADR-0101: Co-op validated-letter score (per-player contribution tally)

## Status

Accepted

## Context

In co-op (ADR-0018, ADR-0084), ADR-0086 already attributes every locked cell to
the player who completed its word (`lockedPositions[].lockedBy`, first-writer-
wins on crossings) and tints the board by that owner. The maintainer wants each
player's tag to also carry a **score**: how many validated letters they
contributed. The Résultats co-op finish screen carried a code comment noting
"no scores — versus mode is a deferred follow-up"; this establishes a
*collaborative contribution tally*, distinct from the still-deferred
competitive/versus mode.

Because `lockedBy` is already on every lobby snapshot and every `wordLocked`
frame, the score is a pure client-side derivation — no new wire field.

## Decision

- **Score = number of `lockedPositions` whose `lockedBy` is the player's
  session.** Validated letters, not words. By construction it equals the count
  of that player's coloured cells on the board (ADR-0086), so score and grid
  never disagree.
- Rendered on the **live roster chips** (`PlayerStrip`, join-order, updates as
  words lock) and on the **Résultats finish screen** as a **leaderboard ranked
  by score descending** (ties broken by join order).
- **Frontend only.** A shared helper derives the tally from the existing
  `lockedPositions`. No backend, schema, or persistence change.
- Attribution is *not* per-letter authorship ("letters I personally typed");
  that would need new server-side per-cell author tracking and would make the
  score diverge from the board colours. Rejected.

This establishes co-op scoring, superseding the prior undocumented "no
scores" assumption carried only in a code comment: the collaborative
contribution tally is now shown; competitive/versus scoring remains deferred.

## Consequences

### Easier
- Players see who contributed what, consistent with the existing per-finder
  board colouring. Reconnects/late-joiners see correct scores (derived from the
  snapshot's `lockedPositions`).

### Harder
- Nothing structural — one helper plus two presentational surfaces.

### Different
- The Résultats participant card becomes a ranked contribution tally rather than
  an unordered "who was here" list.

## Relationships

- **Builds on ADR-0086** (per-cell `lockedBy` attribution) and **ADR-0018 /
  ADR-0084** (co-op locking). Reuses **ADR-0050** a11y posture.
