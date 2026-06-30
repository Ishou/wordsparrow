# ADR-0080: Daily puzzle unique identity (regeneration-safe)

## Status
Accepted

## Context
`DailyPuzzleSelector.puzzleIdForDate` derives a **deterministic** UUID v7
from the calendar date (the 48-bit timestamp is the date's UTC-midnight
epoch-ms; the random portions are seeded by `date.toEpochDay()`). The id is
therefore a pure function of the date, and three call-sites rely on that:

- the daily GET (`PuzzleRoute.kt`, `/v1/puzzles/daily`) resolves the date to
  an id and reads the persisted row;
- the daily list/archive (`ListDailyPuzzlesUseCase`) maps each date in a
  range to its id and fetches summaries;
- `EnsureUpcomingDailiesUseCase` uses `puzzleRepository.get(puzzleId) != null`
  as its idempotency check when pre-generating the rolling 7-day window.

Determinism was chosen so the same date always resolves to the same stored
grid (hint/validate consistency) and so independent clients hitting the daily
endpoint on the same day agree on the underlying grid (a multiplayer
prerequisite).

This is now in tension with **regenerating dailies against a corrected word
corpus**. Daily clues are frozen snapshots inside `puzzles.payload` (JSONB),
and solo progress is keyed by `puzzleId` alone, with no grid shape/version
check. The failure modes:

- **Silent progress corruption.** Regenerating a date would reuse the same
  deterministic id with a *new* layout. Stored progress entries and
  validated-cell locks, keyed only by `puzzleId`, would replay onto a grid
  whose cells no longer mean the same thing — wrong letters locked into wrong
  cells, with no signal that anything is off.
- **No refresh path.** `EnsureUpcomingDailies` is idempotent-skip with no
  delete or update: if a row for the date already exists it logs
  `daily_already_persisted` and moves on. There is no way to replace a bad
  daily once it is stored.

We need to regenerate dailies without corrupting in-progress boards, while
keeping the immutable-puzzle design (puzzles are insert-only; GET is a pure
read) and not breaking multiplayer.

## Decision
Daily puzzle identity becomes **unique per generation**, with the date acting
as a lookup key resolved to the current row:

- **Fresh id per generation.** Each daily generation inserts a **new random
  UUID**. The id is no longer derived from the date.
- **Date carried as a column.** The `puzzles` table gains a nullable
  `puzzle_date` column plus an index; daily rows set it, the on-demand
  (non-daily) path leaves it null.
- **Date resolves to latest.** "Today's daily" (and any past date) resolves
  to the **most-recently-created `puzzles` row for that `puzzle_date`** —
  latest by `created_at`. A date->current-id resolver replaces the
  deterministic `puzzleIdForDate` at the three call-sites above.
- **Regeneration appends; newest wins.** Re-generating a date **inserts** a
  new row rather than deleting or updating the prior one. The prior row stays
  on disk, immutable; the resolver simply stops pointing at it. This
  preserves the insert-only, immutable-puzzle design.
- **Unchanged date-derived facets.** `gridNumber` (day count since the launch
  anchor) and `difficulty` stay pure functions of the date — they are not
  identity and need no row lookup.

## Consequences
- **Three call-sites change.** The daily GET, the daily list/archive, and the
  ensure-dailies idempotency check move from "compute the deterministic id"
  to "resolve the date to its current row". The idempotency check becomes
  "does a row already exist for this `puzzle_date`?" rather than a fixed-id
  `get`.
- **One migration.** Adds `puzzle_date` plus a supporting index. Expand-and-
  contract: the column is nullable and additive, existing rows and the
  on-demand path are unaffected.
- **Multiplayer preserved.** The id flows through the lobby once formed, so
  every member of a lobby shares one grid (intra-lobby consistency). Two
  independent clients still agree because the server resolves the same date
  to the same current row. The only split is a regeneration that lands
  *during* a live session between two separately-formed lobbies — a rare
  admin action, accepted.
- **No frontend change.** Hint usage, solo progress, and the cross-device
  sync blobs (ADR-0075) are all keyed by `puzzleId`. A regenerated grid gets
  a brand-new id, so it starts from fresh, uncorrupted state instead of
  replaying stale entries onto mismatched cells. The client keeps using
  whatever id the daily endpoint hands it; nothing client-side needs to know
  identity stopped being date-deterministic.
- **Superseded rows accumulate.** Old daily rows for a regenerated date are
  orphaned (no resolver points at them) but not deleted. Garbage collection
  of superseded rows is deferred to a follow-up.
- **Trade-off.** A `puzzle_date`->row lookup replaces a pure function. The
  cost is one indexed read per daily resolution; the benefit is that
  regeneration can no longer collide with stored progress.

This ADR is governance-only. The migration, the date->current resolver, and
the three call-site rewrites land in the follow-up implementation PRs
(Wave 3b/3c).
