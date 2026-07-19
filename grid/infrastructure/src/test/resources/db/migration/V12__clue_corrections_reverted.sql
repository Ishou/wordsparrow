-- reverted_at deactivates a correction (ADR-0116); active()/export/backfill-claim skip reverted rows.
ALTER TABLE clue_corrections ADD COLUMN reverted_at TIMESTAMPTZ;
