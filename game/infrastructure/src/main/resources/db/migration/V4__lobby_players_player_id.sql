-- Account-scoped live player identity (ADR-0066 amendment (e)).
-- A lobby seat is now identified by player_id = coalesce(user_id, session_id):
-- two devices of one authenticated account are one seat, one score. session_id
-- stays as the per-device transport correlation and keeps the (lobby_id,
-- session_id) primary key; this index expresses the new invariant at the DB
-- level without a schema rewrite (expand-and-contract, backward-compatible).
-- lobby_players is DELETE+INSERT rewritten on every save, so no row backfill is
-- needed; the deduped roster is written on the next mutate.
CREATE UNIQUE INDEX IF NOT EXISTS lobby_players_identity_idx
    ON lobby_players (lobby_id, coalesce(user_id, session_id));
