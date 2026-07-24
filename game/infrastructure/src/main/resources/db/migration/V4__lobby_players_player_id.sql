-- Account-scoped live player identity (ADR-0066 amendment (e)).
-- A lobby seat is now identified by player_id = coalesce(user_id, session_id):
-- two devices of one authenticated account are one seat, one score. session_id
-- stays as the per-device transport correlation and keeps the (lobby_id,
-- session_id) primary key; this index expresses the new invariant at the DB
-- level without a schema rewrite (expand-and-contract, backward-compatible).

-- Dedup any legacy rows that already share an account identity within a lobby
-- BEFORE the unique index, so the migration cannot abort on existing prod data.
-- Such a duplicate is reachable pre-fix: an anon seat later stamped with a
-- user_id (rebindAnonSeats) that also has a second authed seat in the same
-- lobby yields two rows with the same user_id. Keep the earliest seat
-- (joined_at, then session_id as a deterministic tie-break) and drop the rest.
DELETE FROM lobby_players lp
USING lobby_players other
WHERE lp.lobby_id = other.lobby_id
  AND coalesce(lp.user_id, lp.session_id) = coalesce(other.user_id, other.session_id)
  AND (other.joined_at, other.session_id) < (lp.joined_at, lp.session_id);

CREATE UNIQUE INDEX IF NOT EXISTS lobby_players_identity_idx
    ON lobby_players (lobby_id, coalesce(user_id, session_id));
