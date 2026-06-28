-- puzzle_progress: cross-device solo progress as an opaque per-puzzle blob (ADR-0075). ON DELETE CASCADE ties erasure to deleteMe (ADR-0045) for free; PK enforces one row per (user, puzzle).

CREATE TABLE puzzle_progress (
    user_id    UUID        NOT NULL REFERENCES identity_users (user_id) ON DELETE CASCADE,
    puzzle_id  UUID        NOT NULL,
    payload    JSONB       NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, puzzle_id)
);
