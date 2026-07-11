-- player_reports: report capture (ADR-0103); text-join match on (word_text, clue_text), no item FK.

CREATE TABLE player_reports (
    report_id   UUID PRIMARY KEY,
    word_text   TEXT NOT NULL,
    clue_text   TEXT NOT NULL,
    reason      TEXT NOT NULL CHECK (reason IN
                  ('mot_offensant','definition_offensante','erreur_sens','erreur_grammaire',
                   'definition_revele','ambigu','trop_facile','trop_difficile','autre')),
    note        TEXT,
    puzzle_id   UUID,
    surface     TEXT NOT NULL CHECK (surface IN ('solo','daily','multiplayer','mini_game')),
    reporter_id UUID,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dismissed','actioned')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    triaged_at  TIMESTAMPTZ,
    triaged_by  UUID
);

CREATE INDEX player_reports_pending ON player_reports (created_at) WHERE status = 'pending';
CREATE UNIQUE INDEX player_reports_dedup
    ON player_reports (reporter_id, word_text, clue_text) WHERE reporter_id IS NOT NULL;
