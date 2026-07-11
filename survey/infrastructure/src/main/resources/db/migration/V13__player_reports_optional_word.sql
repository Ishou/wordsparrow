-- Make wordText optional (ADR-0103): an offensive clue is reportable without solving the word.
-- Re-key dedup on (reporter_id, clue_text, puzzle_id); NULL puzzle_id degrades dedup gracefully (Postgres treats NULLs as distinct).

ALTER TABLE player_reports ALTER COLUMN word_text DROP NOT NULL;

DROP INDEX player_reports_dedup;
CREATE UNIQUE INDEX player_reports_dedup
    ON player_reports (reporter_id, clue_text, puzzle_id) WHERE reporter_id IS NOT NULL;
