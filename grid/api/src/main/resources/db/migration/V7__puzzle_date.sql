-- ADR-0081: daily puzzle identity becomes unique-per-generation; the calendar
-- date moves from a deterministic id derivation to a stored lookup key. The
-- column is nullable and additive (expand-and-contract): on-demand puzzles
-- leave it NULL, daily rows stamp it, and "today's daily" resolves to the
-- most-recently-created row for the date.

ALTER TABLE puzzles ADD COLUMN puzzle_date DATE;

CREATE INDEX idx_puzzles_date_created ON puzzles (puzzle_date, created_at DESC);

-- Backfill legacy daily rows. Pre-ADR-0081 daily ids were a deterministic UUID
-- v7 whose top 48 bits are the date's UTC-midnight epoch-ms (see
-- DailyPuzzleSelector.deterministicUuidV7). On-demand rows used a time-based v7
-- minted at request time, so their decoded timestamp is never midnight-aligned;
-- filtering on the midnight modulo backfills daily rows only and leaves
-- on-demand rows NULL.
UPDATE puzzles
   SET puzzle_date =
           (to_timestamp(decoded.ts_ms / 1000.0) AT TIME ZONE 'UTC')::date
  FROM (
      SELECT puzzle_id,
             ('x' || substr(replace(puzzle_id::text, '-', ''), 1, 12))::bit(48)::bigint AS ts_ms
        FROM puzzles
  ) decoded
 WHERE puzzles.puzzle_id = decoded.puzzle_id
   AND decoded.ts_ms % 86400000 = 0;
