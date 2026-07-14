# ADR-0114: Key solo progress by puzzleId alone (retire grid fingerprint)

## Status

Accepted (supersedes ADR-0105, amends ADR-0075)

## Context

ADR-0105 tagged every solo-progress blob with a **grid fingerprint** — a hash of
grid structure (cell kinds, positions, definition-clue **text**, dimensions) — and
discarded the blob on grid-open when its stored fingerprint did not match the
current grid. Its job was to stop locked/typed letters from being replayed onto a
structurally different grid after a regeneration reused a `puzzleId` (a
pre-ADR-0081 hazard), and to heal legacy corrupted blobs.

ADR-0108 then let a maintainer fix a reported clue by rewriting the definition
text in the stored `puzzles.payload` **in place**, preserving the `puzzleId` and —
per ADR-0108 §4 — the player's progress.

These two collide. The fingerprint hashes definition-clue text, so an in-place
clue correction flips it even though the `puzzleId`, the cell layout, and every
answer are unchanged. ADR-0105's discard then wipes the progress ADR-0108 §4
promised to keep: the player's completed grid opens **empty**, while the calendar —
which derives "done" from the raw locked-cell count with no fingerprint check —
still shows the date **solved**. Observed on the 2026-07-12 daily after a
report-driven correction.

The keying was already sufficient without the fingerprint. Post-ADR-0081,
`puzzleId` discriminates the two events the fingerprint was built to separate:

- **Regeneration** mints a fresh random UUID v7 and appends a new row
  (`EnsureUpcomingDailiesUseCase.persistGenerated` → `freshDailyId`), so progress
  keyed by `puzzleId` is orphaned cleanly (ADR-0081).
- **Clue correction** runs `UPDATE puzzles SET payload = ? WHERE puzzle_id = ?`
  (`PostgresGridBackfill`), preserving the id; the patch
  (`ClueCorrectionPayloadPatch`) only rewrites clue text/selection — never
  `wordText`, positions, or answers — so filled letters stay valid.

No same-`puzzleId` operation changes answers, so the fingerprint's only same-id
firing is on clue text: always a false positive. Its one irreplaceable job —
healing legacy pre-ADR-0081 deterministic-id blobs that still share a current id —
is spent: the 2026-07-11 full-history regen re-minted a fresh id for every daily,
so no legacy blob matches a current daily id.

## Decision

Retire the grid fingerprint; key solo progress solely on `puzzleId`.

- Delete `gridFingerprint`; drop the `fingerprint` field from the `SoloStore`
  blob (localStorage bucket and the opaque ADR-0075 wire payload) and
  `reconcileFingerprint` from the blob-store port and localStorage.
- `pullAndMergeOne(puzzleId)` no longer takes or applies a fingerprint: it pulls,
  semantically merges (ADR-0075 `mergeProgress`), and pushes back, with no
  content-based admission check.
- The calendar (`progressOf(summary.id)`) and the `/play` loader now both key on
  `puzzleId` alone, so they cannot disagree: a correction ⇒ both keep, a
  regeneration ⇒ both empty.
- Wire compatibility: the blob is opaque JSON; a legacy `fingerprint` field on an
  existing server or local row is ignored on read and dropped on next write. No
  identity API change.

## Consequences

- ADR-0108 §4's progress-preservation guarantee holds: a corrected clue no longer
  wipes a solved grid, and the done-pill matches what the grid opens to.
- The pre-merge admission check is gone; `mergeProgress` is unchanged and remains
  the sole collision policy.
- Legacy risk accepted: without the fingerprint, a pre-ADR-0081 deterministic-id
  blob that still matched a current id would replay onto a different grid. The
  2026-07-11 full-history regen already changed every daily id, closing this for
  dailies; on-demand/practice grids have always used fresh ids. Pre-alpha — a
  stray legacy blob is a one-off clear, not systemic corruption.
- Server-side cache correctness is unaffected: the ADR-0089 daily ETag
  (`<puzzleId>-<clue-hash>`) still flips on both regeneration and correction, so
  clients fetch the corrected grid.
- ADR-0110 blocklist backfill orphans progress via the `puzzleId` change
  (force-regen for dailies, row-delete-then-regen for solo) rather than the
  fingerprint; behavior is unchanged, since blocklisting always regenerates and
  never patches answers in place.
