-- ADR-0066 amendment 2026-07-05: owner-visibility parity for the user-scoped
-- lobby list. The owner's lobby_players seat is deleted by the 30s leave-grace,
-- so `findByUserId` needs an owner_user_id it can match against independently of
-- that seat. Set once at create, never overwritten (see PostgresLobbyRepository
-- upsert ON CONFLICT list). Expand-and-contract: nullable, additive, backward-
-- compatible; the read arm tolerates NULL.
ALTER TABLE lobbies ADD COLUMN owner_user_id UUID NULL;

CREATE INDEX idx_lobbies_owner_user_id ON lobbies (owner_user_id) WHERE owner_user_id IS NOT NULL;

-- Best-effort backfill: rows whose owner still holds their seat get the owner's
-- userId. Owners already leave-graced out predate the fix and stay NULL.
UPDATE lobbies l
SET owner_user_id = lp.user_id
FROM lobby_players lp
WHERE lp.lobby_id = l.id
  AND lp.session_id = l.owner_session_id
  AND lp.user_id IS NOT NULL;
