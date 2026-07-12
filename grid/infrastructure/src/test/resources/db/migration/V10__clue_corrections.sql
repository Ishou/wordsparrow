-- Clue corrections store (ADR-0108). Expand-and-contract; no FK to puzzles -- the link is the text-join on old_clue_text (ADR-0103 report grouping).
CREATE TABLE clue_corrections (
    correction_id       UUID PRIMARY KEY,
    kind                TEXT NOT NULL CHECK (kind IN ('replace', 'forbid_clue')),
    word_text           TEXT,
    old_clue_text       TEXT,
    new_clue_text       TEXT,
    reason              TEXT,
    created_by          UUID NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    exported_at         TIMESTAMPTZ,
    backfill_status     TEXT NOT NULL DEFAULT 'pending'
                            CHECK (backfill_status IN ('pending', 'running', 'done', 'failed')),
    grids_matched       INTEGER,
    grids_patched       INTEGER NOT NULL DEFAULT 0,
    backfill_error      TEXT,
    backfill_updated_at TIMESTAMPTZ
);

-- Partial index: the worker's claim query scans only unfinished corrections.
CREATE INDEX idx_clue_corrections_backfill_active
    ON clue_corrections (backfill_status)
    WHERE backfill_status IN ('pending', 'running');
