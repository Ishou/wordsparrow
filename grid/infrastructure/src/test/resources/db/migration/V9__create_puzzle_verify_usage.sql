-- Per-(puzzle, user) grid-verification cooldown gate (ADR-0099). Mirrors
-- puzzle_hint_usage's final (post-V6) user_id-keyed shape; no session_id
-- generation here since this table is user_id-only from creation.
--
-- Atomic check-and-record is one statement away:
--   INSERT INTO puzzle_verify_usage (puzzle_id, user_id, last_verified_at)
--     VALUES ($1, $2, now())
--     ON CONFLICT (puzzle_id, user_id) DO UPDATE
--       SET last_verified_at = EXCLUDED.last_verified_at
--   -- only executed by the caller once VerifyCooldownCalculator confirms the prior row is stale.

CREATE TABLE puzzle_verify_usage (
    puzzle_id        UUID        NOT NULL REFERENCES puzzles(puzzle_id) ON DELETE CASCADE,
    user_id          UUID        NOT NULL,
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (puzzle_id, user_id)
);

CREATE INDEX puzzle_verify_usage_user_id_idx ON puzzle_verify_usage (user_id);
