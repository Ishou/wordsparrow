# ADR-0105: Discard solo progress typed on a regenerated grid (grid fingerprint)

## Status

Accepted (amends ADR-0075)

## Context

Solo progress is stored and merged by `(puzzleId, row, col)` (ADR-0075). The
merge (`mergeProgress`) is a pure cell-coordinate union: a stored letter for a
cell is applied by coordinate regardless of what that cell *is* in the current
grid. This is correct only while a `puzzleId` maps to a single, fixed grid.

That assumption was violated before ADR-0081, when a daily's id was a
deterministic UUID derived from the date. Regenerating a date reused the id, so
progress stored under it — including **locked (validated) cells** — was replayed
onto the structurally different new grid: letters landed in the wrong cells, and
a stale locked cell (which carries top priority in the merge) overrode the new
grid's correct cell. ADR-0081 fixed this going forward by minting a fresh id per
regeneration, so new regenerations orphan old progress instead of merging it.

Two gaps remain:

1. **Legacy corruption persists.** Blobs poisoned before ADR-0081 still sit in
   `localStorage` and on the identity-owned server store under the reused id, and
   re-apply on every load. Fresh ids do not heal already-written blobs.
2. **No structural guard.** Nothing ties a stored entry to the grid it was typed
   on, so any future id collision (a stale cache, a regression) would silently
   corrupt a grid again rather than discard the stale data.

## Decision

Tag every solo-progress blob with a **grid fingerprint** and discard the blob
when it does not match the grid being opened.

- `gridFingerprint(puzzle)` (frontend `domain/puzzle`) is a pure, deterministic
  hash of grid **structure** — cell kinds, positions, and definition clues
  (text + arrow + separators) — plus the grid dimensions. It deliberately
  excludes typed letters (`LetterCell.entry`), so it is stable as the player
  fills the grid but changes whenever the grid is regenerated.
- The fingerprint is stored on the blob (`localStorage` bucket and the
  ADR-0075 wire payload — an optional field on the opaque JSON, no identity API
  change). Writes preserve it; a merge stamps the current grid's fingerprint.
- On grid-open, before render, the `/play` loader computes the current grid's
  fingerprint and passes it to `pullAndMergeOne`:
  - **Local:** `reconcileFingerprint` discards the local blob when its stored
    fingerprint differs from the current grid's — **a missing fingerprint counts
    as a mismatch**, so legacy blobs are discarded on first load. This runs even
    for anonymous players (no network), before render.
  - **Remote:** a pulled blob whose fingerprint differs from the current grid is
    treated as empty and not merged; the clean local blob is then pushed back,
    overwriting (healing) the poisoned server row.

Discarding un-fingerprinted progress means genuine in-progress dailies from
before this change are cleared once. That is acceptable for the current
pre-alpha stage and is the only way to positively distinguish a corrupted legacy
blob from a clean one, since neither carries a fingerprint.

## Consequences

- Legacy cross-grid corruption is healed on next load (mismatch ⇒ discard) and
  cannot recur: a blob only survives when it matches the grid in front of it.
- The fingerprint stays out of collision resolution (`mergeProgress` is
  unchanged); it is a pre-merge admission check, not a tiebreak.
- Cost: pre-change progress is discarded once (no fingerprint ⇒ treated stale),
  and opening a grid stamps a bare-fingerprint bucket that the batch sync skips
  as "no progress."
- `grid/api/openapi.yaml` still describes the pre-ADR-0081 deterministic-id
  contract; that stale prose is unrelated to this change and is tracked
  separately.
