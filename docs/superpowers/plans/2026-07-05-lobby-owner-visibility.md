# Plan — Lobby owner-visibility parity in `À plusieurs`

**Date:** 2026-07-05
**Context:** `game/` bounded context. Governs ADR-0018, ADR-0039, ADR-0066, ADR-0083.
**Type:** production bug fix (2 phases, ADR-first).

## Symptom

On prod, an authenticated player creates a multiplayer lobby, starts a
game (lobby → `IN_PROGRESS`), navigates away, and the lobby never appears
in the `/grilles` → `À plusieurs` tab afterwards. Reported 2026-07-05.
Reproduces every time on any return visit.

## Root cause

Authed players are the only ones who can create a lobby (ADR-0083 gates
`POST /v1/lobbies` on a valid cookie). The `À plusieurs` tab therefore
loads via the **user-scoped** path `GET /v1/users/me/lobbies` →
`ListLobbiesForUser` → `LobbyRepository.findByUserId(userId)`.

The owner is identified two ways:

- `lobbies.owner_session_id` (a `SessionId`; there is **no
  `owner_user_id` column** — checked `V1`/`V2` migrations), and
- their row in `lobby_players`, which carries `user_id`.

On WebSocket disconnect (navigating away, closing the tab) a 30s
reconnect grace fires `leaveLobby`, which **deletes the owner's
`lobby_players` row** (`LobbyWebSocketRoute.kt:75-79, 469-511` →
`LeaveLobbyUseCase`; `owner_session_id` is kept, the seat is removed).
Other joiners have `user_id = NULL` (`JoinLobbyUseCase` never sets it),
so after the owner leaves, **no seat carries the owner's `user_id`.**

The two list queries then diverge (`PostgresLobbyRepository.kt`):

- `findBySessionId` (line 94): `WHERE (l.owner_session_id = ? OR
  EXISTS(seat.session_id = ?))` — has an owner arm (comment line 90:
  *"owner arm keeps lobby visible after leave-grace drops owner from
  lobby_players"*).
- `findByUserId` (line 120, ADR-0066): `WHERE EXISTS(seat.user_id = ?)`
  — **no owner arm**, and it structurally cannot have one because there
  is no `owner_user_id` to match against.

So a started lobby vanishes from the authed tab the moment the owner's
leave-grace elapses. The session-scoped tab is unaffected (owner arm).
The frontend's `.catch(() => setLobbies([]))` in `GrillesArchiveScreen`
silently swallows nothing here — the query legitimately returns `[]`.

Why tests missed it: repository tests exercise `findByUserId` with the
owner still seated; none reproduce the *leave-grace-then-list* sequence.

## Fix — owner-visibility parity via `owner_user_id`

Mirror the session-side owner arm on the user-side query. The owner's
`userId` is known at create time and must be persisted independently of
the seat that later gets deleted.

1. **`owner_user_id` column** on `lobbies` (nullable — legacy anon-owned
   rows stay null; ADR-0083 makes all new lobbies authed so it is set in
   practice). Expand-and-contract: additive, backward-compatible.
2. **Persist it from the domain**, set once at create and never
   overwritten by a later save (deriving it from `players[owner]` at save
   time is wrong — that map no longer contains the owner after the leave
   we are fixing).
3. **Owner arm on `findByUserId`**: `WHERE (l.owner_user_id = ? OR
   EXISTS(seat.user_id = ?)) AND l.state IN ('IN_PROGRESS','COMPLETED')`.
4. Same owner arm in `InMemoryLobbyRepository.findByUserId`.
5. ADR-0066 amendment documenting the parity (supersedes its §3 "No data
   migration" for this follow-up).

Rejected alternatives: (a) resolve `owner_session_id → userId` at query
time — impossible, the only session→user map in `game` was
`lobby_players`, which is what gets deleted; (b) stop removing the owner
seat on leave — a far broader change to the presence/GC model.

## Phase map (ADR-first, ADR-0001 §7)

| Phase | PR | Scope | Depends on |
|-------|----|-------|-----------|
| A | ADR-0066 amendment | `docs/adr/0066-cross-device-my-lobbies.md` — add an "Amendment 2026-07-05: owner-visibility parity" section: owner_user_id column, `findByUserId` owner arm, why leave-grace makes the seat-only union insufficient. Update `docs/adr/INDEX.md` if the path-glob binding needs it. | — |
| B | Implementation | `V3__lobbies_owner_user_id.sql`; `Lobby` domain field `ownerUserId: UserId?`; `CreateLobbyUseCase` sets it; `PostgresLobbyRepository` (upsert write once via `ON CONFLICT` excluding the column, hydrate read, owner arm on `findByUserId`); `InMemoryLobbyRepository` owner arm; tests reproducing leave-then-`findByUserId` (Testcontainers + in-memory) + a use-case test. | Phase A merged |

Phase B is a coherent single workstream that may exceed the ADR-0001 §4
400-line soft target once the migration + domain + both repos + tests are
counted. Implementer invokes the 2026-05-25 soft-target override in the PR
body from the first push, and asks "should this split?" first (it should
not — the migration, the write, and the query are one atomic change).

## Verification

Phase B implementer must, before opening the PR, add a repository-level
test that: creates an authed-owner lobby → starts a game → runs
`leaveLobby(owner)` → asserts the lobby still exists AND
`findByUserId(ownerUserId)` returns it. That test must fail on `main`
(red) and pass with the fix (green).
