-- Correction reversal (ADR-0116): reopening a triaged report can reverse the correction it triggered.
-- reverted_at deactivates a correction -- the generation overlay (active()) and the corpus export both skip reverted rows.
ALTER TABLE clue_corrections ADD COLUMN reverted_at TIMESTAMPTZ;
