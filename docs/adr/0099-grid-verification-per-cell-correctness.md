# ADR-0099: Grid verification returns per-cell correctness

## Status

Accepted

## Context

Solo puzzles currently offer only **hints**: `POST /v1/puzzles/{id}/hints`
reveals every letter of the focused word (ADR-0076 §8), budgeted by
`Puzzle.hintsAllowed`. Revealing whole words is a strong assist that
short-circuits the puzzle — there is no "check my work" action that gives
feedback without giving away letters.

We want to replace the solo assist with **grid verification**: the player
submits the letters they have filled in so far, correct cells lock (reusing
the hint/co-op lock mechanic), wrong cells stay editable. This requires a
new server capability, `POST /v1/puzzles/{id}/verify`, that returns
per-cell `correct: boolean` for the cells the player submitted.

That response is more than ADR-0076 §9's `ValidatePuzzleResult` — a
deliberately binary oracle (`{ solved }`, no positional data) — allows.
Per-cell correctness is positional feedback, so this ADR relates to and
amends ADR-0076's answer-off-the-wire posture rather than fitting inside
it unchanged.

## Decision

### 1. `/verify` returns per-cell correctness for filled cells only

`POST /v1/puzzles/{id}/verify` accepts the cells the player has filled and
not yet locked, and returns `{ row, column, correct }` for exactly those
cells — never the canonical letter, and never for cells the player did not
submit. A wrong cell tells the player "not this letter," not "the answer
is X." This is a **new**, narrower carve-out alongside ADR-0076 §7's hint
exception: hints reveal letters outright; `/verify` reveals one bit per
submitted cell.

### 2. A 30-minute per-puzzle server-authoritative cooldown is the rate-limit mitigation

Every successful call starts a 30-minute cooldown keyed by
`(user_id, puzzle_id)`, enforced server-side (survives reloads, not
bypassable by clearing localStorage or switching device). Within the
cooldown, the server returns `429` with `{ secondsUntilNextVerify }` and
**no** `cells` array, so an early call leaks nothing beyond "you must
wait."

The cooldown is the named mitigation against using `/verify` as an
answer-key oracle: a uniform-letter sweep of the alphabet (26 calls, one
per candidate letter, to pin every cell in a grid) is bounded to roughly
2 calls/hour × 26 ≈ 13 hours per puzzle. This is strictly less generous
than the hint mechanic it replaces, which could reveal every word in the
grid for the price of `hintsAllowed` credits with no cooldown at all.

### 3. `/validate` stays binary and uncapped; `/hints` stays as-is

`POST /v1/puzzles/{id}/validate` is unchanged: `{ solved: boolean }`, no
positional data, no rate limit (ADR-0076 §9). `/hints` is unchanged in
shape and budget (ADR-0076 §§7–8); it becomes **dormant on solo** — the
frontend's assist-mode seam selects `'verify'` — but the endpoint,
use-case, and tables are not removed, so a future lobby setting can
re-enable it.

## Consequences

### Easier

- Solo players get "check my work" feedback without a whole-word reveal,
  a materially weaker assist than the mechanic it replaces.
- `/validate` and `/hints` need no changes; both keep their existing
  threat models untouched.

### Harder

- The answer-off-the-wire posture now has two carve-outs (hint reveal,
  verify correctness) instead of one; a future reviewer must check new
  puzzle endpoints against both instead of assuming ADR-0076 §9's binary
  rule is universal.
- The per-cell leak is bounded by the cooldown, not eliminated — a patient
  attacker can still reconstruct a puzzle over ~13 hours. Accepted as
  residual risk, same posture as ADR-0076 §4's accepted dictionary-mapping
  risk for the teaser token.

### Different

- This is the first puzzle-grid endpoint to return positional
  per-cell data since ADR-0076 §9 restricted `/validate` to a single bit;
  the cooldown is what makes that acceptable here where it was not for an
  uncapped endpoint.
