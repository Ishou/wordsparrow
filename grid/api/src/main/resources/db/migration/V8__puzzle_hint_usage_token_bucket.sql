-- Expand step: turn the monotonic hints_used counter into a token bucket.
-- Capacity 3 mirrors LoadOrGeneratePuzzleUseCase.DEFAULT_HINTS_ALLOWED; hints_used
-- is kept this release so a rollback to the prior image still reads (contract later).
ALTER TABLE puzzle_hint_usage
    ADD COLUMN tokens_remaining INT         NOT NULL DEFAULT 3 CHECK (tokens_remaining >= 0),
    ADD COLUMN refill_anchor    TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE puzzle_hint_usage
    SET tokens_remaining = GREATEST(0, 3 - hints_used),
        refill_anchor    = now();
