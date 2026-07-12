-- Blocklist-word correction (ADR-0110). Expand-and-contract; a blocklist carries no clue text, so old_clue_text is relaxed to nullable.
ALTER TABLE clue_corrections DROP CONSTRAINT IF EXISTS clue_corrections_kind_check;
ALTER TABLE clue_corrections
    ADD CONSTRAINT clue_corrections_kind_check
        CHECK (kind IN ('replace', 'forbid_clue', 'blocklist_word'));

ALTER TABLE clue_corrections ALTER COLUMN old_clue_text DROP NOT NULL;
