-- Per-(puzzle, user) grid-verification cooldown gate (ADR-0099); mirrors puzzle_hint_usage's user_id-keyed shape.

CREATE TABLE puzzle_verify_usage (
    puzzle_id        UUID        NOT NULL REFERENCES puzzles(puzzle_id) ON DELETE CASCADE,
    user_id          UUID        NOT NULL,
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (puzzle_id, user_id)
);

CREATE INDEX puzzle_verify_usage_user_id_idx ON puzzle_verify_usage (user_id);
