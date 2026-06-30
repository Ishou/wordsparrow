-- Expand step (token bucket); hints_used kept this release for rollback-read compat, contract later.
ALTER TABLE puzzle_hint_usage
    ADD COLUMN tokens_remaining INT         NOT NULL DEFAULT 3 CHECK (tokens_remaining >= 0),
    ADD COLUMN refill_anchor    TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE puzzle_hint_usage
    SET tokens_remaining = GREATEST(0, 3 - hints_used),
        refill_anchor    = now();
