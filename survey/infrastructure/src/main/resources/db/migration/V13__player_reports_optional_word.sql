-- Make wordText optional (ADR-0103): an offensive clue is reportable without solving the word.
-- Re-key dedup on (reporter_id, clue_text, puzzle_id); NULL puzzle_id degrades dedup gracefully (Postgres treats NULLs as distinct).

ALTER TABLE player_reports ALTER COLUMN word_text DROP NOT NULL;

-- Collapse rows that the old (reporter, word, clue) key allowed but the new (reporter, clue, puzzle) key forbids, else the unique-index rebuild aborts.
DELETE FROM player_reports a USING player_reports b
WHERE a.ctid < b.ctid
  AND a.reporter_id IS NOT NULL
  AND a.reporter_id = b.reporter_id
  AND a.clue_text = b.clue_text
  AND a.puzzle_id IS NOT DISTINCT FROM b.puzzle_id;

DROP INDEX player_reports_dedup;
CREATE UNIQUE INDEX player_reports_dedup
    ON player_reports (reporter_id, clue_text, puzzle_id) WHERE reporter_id IS NOT NULL;
