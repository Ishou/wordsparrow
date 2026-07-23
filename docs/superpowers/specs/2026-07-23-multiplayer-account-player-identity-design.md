# Multiplayer account-scoped player identity

## Problem

An authenticated user who joins the **same** multiplayer lobby from two
devices (mobile + desktop) appears **twice** — two roster rows, two
separate scores — instead of once with a single shared score.

### Root cause (traced end-to-end)

Player identity in the live game is keyed on a **per-device `sessionId`**
(UUID v7 in each browser's `localStorage`, ADR-0018 §6), not on the
account. ADR-0066(b) bolted "authed cross-device rejoin" on top: when the
same verified `userId` joins from a second device, `JoinLobbyUseCase.seat()`
is meant to **move** the seat rather than duplicate it
(`game/application/.../usecases/LobbyUseCases.kt:154-169`):

```kotlin
val withoutStaleSeat =
    if (seatUserId != null) lobby.players.filterValues { it.userId != seatUserId }
    else lobby.players
...
emitted = LobbyEvent.PlayerJoined(player)          // ONLY event emitted
return lobby.copy(players = withoutStaleSeat + (sessionId to player), ...)
```

The old seat is dropped from **server** state, but the only broadcast is
`PlayerJoined(newSessionId)` — **there is no `PlayerLeft(oldSessionId)`**.
`handleOutcome` broadcasts that single event to every socket
(`game/api/.../routes/LobbyWebSocketRoute.kt:456-458`), and the frontend
reducer appends the new row but is never told to drop the old one
(`frontend/src/ui/components/lobby/lobbyView.ts:76-93`, dedupes by
`sessionId` only). Both devices end up rendering `{S1, S2}` — you, twice.
Because scores are tallied per `sessionId` (`lockedBy`, ADR-0102 /
ADR-0086), each phantom row carries its own independent count.

The identity cookie is **not** the culprit: `__Secure-ws_session` is
`Domain=wordsparrow.io`, so it reaches the `game.wordsparrow.io` WS
handshake, `verifiedUserId` is non-null, and the de-dup fires. The defect
is purely that a seat *move* is never expressed on the wire as a removal,
and that identity + score are keyed on the device rather than the account.

## Decision

For **authenticated** players, make the live game model **account-scoped**:
one account = one roster row = one score, on every device and across a
device switch. Anonymous players are unchanged (still per-device). Scope is
deliberately bounded to **roster + score attribution**; ownership and
presence stay session-based.

### 1. Stable identity — `PlayerId`

A new domain value type `PlayerId(value: String)`, derived once per socket
at the API edge from server-verified inputs:

```
playerId = verifiedUserId?.value ?: sessionId.value
```

- Authed → the account's `userId` (identical on every device).
- Anon → the device's `sessionId` (byte-for-byte the current behaviour:
  one guest per device).
- `verifiedUserId` comes from the connect-time identity cookie verification
  (`LobbyWebSocketRoute.kt:116-127`), **never** from a client frame — so a
  client cannot assert another account's identity (same trust root as
  ADR-0066(b)).

### 2. Roster — re-key on `PlayerId`

`Lobby.players: Map<SessionId, Player>` → `Map<PlayerId, Player>`.
`Player` carries `playerId` as its identity; `sessionId` stops being the
seat key (it becomes a connection detail owned by the transport layer, §6).

Join becomes a plain **idempotent upsert keyed on `playerId`**. A second
device of the same account maps to the *same key* → a no-op on the roster.
This **deletes** the `withoutStaleSeat` "move the seat" logic entirely:
there is no displacement, therefore no missing `PlayerLeft`, no ping-pong,
and no "you vanished" flash on the other device. One account is one row,
structurally — not by post-hoc de-dup.

### 3. Score — attribute locks to `PlayerId`

`GameSession.lockedPositions: Map<Position, SessionId>` →
`Map<Position, PlayerId>`. A cell lock is credited to the locking socket's
`playerId` (`UpdateCellUseCase`, currently `LobbyUseCases.kt:664`
`associateWith { sessionId }`). On the wire, `lockedBy` becomes a
`PlayerId`.

Downstream this flows through the **existing** attribution consumers
unchanged in shape:

- **ADR-0102** score tally (`frontend/src/application/game/playerScores.ts`,
  `tallyValidatedLetters` grouping by `lockedBy`) now groups by account →
  letters locked from either device aggregate into one score. This delivers
  *"same score on both devices."*
- **ADR-0086** board tint-by-finder (keyed on the same `lockedBy`) now tints
  an account's cells one colour on all its devices — consistent with the
  roster and the score ("your colour is your account's colour"). The
  ADR-0102 invariant *score always equals the count of cells in your colour*
  is preserved by construction.

### 4. Reconnect grace — remove on last session, not per-socket

Today the 30s grace removes the seat by `sessionId` after the socket closes,
unless another live socket still holds that `sessionId` (the multi-tab
de-dupe in `LobbyWebSocketRoute`/`SessionManager`). New rule: after grace,
remove the **player** only if **no other live socket maps to the same
`playerId`**. Closing your laptop while your phone stays connected must
**not** drop your account from the lobby. `SessionManager` already tracks
per-connection binds (`bindUserId`, `bindSession`) and already performs the
analogous "is another connection still here?" check for `sessionId` — we
extend that check from `sessionId` to `playerId`. `playerLeft` now carries a
`playerId`.

### 5. Unchanged on purpose (bounded blast radius)

- **Ownership** stays keyed on `ownerSessionId` + `ownerUserId`; ADR-0066(b)
  already rebinds the owner across devices. `isOwner`, StartGame,
  RotateCode, SetGridConfig, and kick keep their guards verbatim — **zero
  new auth surface**. Kick's *target* shifts from `sessionId` to `playerId`,
  since a roster row is now a `playerId`.
- **Presence / cursors** stay per-session and ephemeral (ADR-0018 §9). Two
  open devices may show two cursors — honest (they are two real cursors) and
  harmless; roster and score are unaffected.

### 6. Transport stays session-scoped (load-bearing invariant)

**Only identity and score collapse to the account. The transport/sync layer
stays per-device.** The two devices remain two distinct sockets that
exchange cell writes, cursors, and typing signals with each other exactly
like any two co-op peers. This is what keeps **mobile → desktop input
reflection** working — and it already works today:

- Server broadcasts every `cellUpdated` to **all** sockets in the lobby with
  **no sender exclusion** (`SessionManager.broadcast`,
  `game/api/.../SessionManager.kt:223-235`).
- The frontend applies **every** remote `cellUpdated` straight to the cell
  with **no self/sessionId filter** (`Grid.tsx:977-984`,
  `applyRemoteCellUpdate`).

The transient per-cell authorship (`cellUpdated.sessionId`, in-progress
`CellEntry.sessionId`) stays keyed on `sessionId` — device-level, drives no
score. Only the durable lock→score attribution (`lockedBy`) becomes
`playerId`.

**Guardrail (explicit non-change):** never introduce self-echo suppression
keyed on `playerId`. That is the single change that *would* break
mobile↔desktop sync — each device would ignore the other's writes as "its
own" echo. Echo and sync must remain at `sessionId` granularity.

### 7. Wire (schema-first, ADR-0001 §3 / ADR-0003)

`game/api/asyncapi.yaml`:

- Define a `PlayerId` schema (string).
- Add `playerId` to `Player`, `playerJoined`, `playerLeft`, `playerRenamed`.
- Change `LockedCellDto.lockedBy` and the `wordLocked` / `lobbyState.game`
  `lockedPositions[].lockedBy` from `SessionId` → `PlayerId`.

Check `game/api/openapi.yaml` for any REST lobby-detail exposure of the
roster or locked positions and align it. Regenerate TS types
(`pnpm api:check`); the `openapi-typescript-drift` gate enforces the
contract.

### 8. Persistence / migration

`PostgresLobbyRepository` stores (confirmed by reading it):

- **`lobby_players`** — one row per seat (`session_id`, `user_id`,
  `joined_at`), **full-rewritten (DELETE+INSERT) on every save**.
- **`game_payload` JSONB** — the `GameSession` projection *sans entries*,
  i.e. `lockedPositions[].lockedBy` lives **inside the JSONB**.
- **`lobby_cell_entries`** — transient per-cell authorship
  (`written_by_session_id`), full-rewritten on every save. This is the
  device-level authorship that **stays `sessionId`** (§6) — no change.

Migration consequences (fixed constraints — **expand-and-contract,
backward-compatible**, CLAUDE.md):

- **Roster:** because `lobby_players` is fully rewritten from the in-memory
  `Map<PlayerId, Player>` on the next save, re-keying needs **no row-dedup
  backfill** — the next mutate writes the deduped set. The open schema
  question the domain PR resolves: what an authed row stores in `session_id`
  (make it nullable and store `user_id` as identity, or keep a "primary"
  `session_id`). Additive/nullable column change only.
- **Locks:** `lockedBy` is a UUID string inside `game_payload`. For anon,
  `playerId == sessionId`, so existing values are already correct. Only an
  authed player's in-flight locks would carry a `sessionId` that should read
  as their `userId`. Lobbies are ephemeral and the payload is rewritten on
  every mutate, so the domain PR chooses between a one-shot JSONB backfill
  and a forward-compatible read that tolerates a legacy `sessionId`-keyed
  `lockedBy` on lobbies literally mid-game at deploy time (bounded, transient
  mis-attribution that self-heals on the next lock). Pin the choice in the PR.

### 9. Edge case — signing in mid-game

`rebindAnonSeats` stamps `userId` onto anon seats at the anon→authed
sign-in transition (ADR-0066(c)). Under this model it must also **re-key**
that roster entry (`sessionId → userId`) and **re-attribute** that session's
locks to the new `playerId`, so a player who signs in mid-game collapses to
their account identity without losing their score. Handled in the domain PR.

### 10. Threat model (auth-adjacent — required by CLAUDE.md)

STRIDE over the change:

- **Spoofing:** the authed `playerId` derives from the server-verified
  `userId` (identity-api whoami at connect time), never from a client frame.
  A client cannot present another account's `playerId`. Anon
  `playerId = sessionId` is client-supplied *exactly as today* (ADR-0018 §7)
  — no regression.
- **Elevation of privilege:** none. Ownership and every owner-gated use case
  keep their existing `isOwner(sessionId)` / `ownerUserId` guards (§5). The
  re-key adds no capability; it only collapses roster rows and score buckets.
- **Information disclosure:** none new. Join still requires the `lobbyId`;
  no arm leaks lobby existence. Roster rows already expose a pseudonym; the
  added `playerId` for an anon player is their own `sessionId` (already on
  the wire), and for an authed player is their `userId`, visible only to
  co-players who already share the lobby.
- Residual risk is bounded by the identity cookie's integrity — the same
  trust root ADR-0066(a)/(b)/(c) already rely on.

## Verification (closes the debugging loop honestly)

A unit-green result is **not** sufficient for a routing/identity bug
(project rule: "green unit test isn't a verified fix"). Required end-to-end
check: two WebSocket connections presenting **the same** `userId` cookie to
one lobby, asserting:

1. **One** roster row for the account (not two).
2. **One** aggregated score counting locks from **both** sockets under the
   account.
3. Letters written on socket A land on socket B in real time (transport
   invariant §6 preserved).
4. No `playerLeft` flap for the account when one socket disconnects while
   the other stays connected (grace §4).

## Scope / delivery (waves — ADR-0001 §1, "plan as waves of PRs")

Each wave is one PR, reviewed and merged before the next. The 400-line cap
applies; waves 3 and 4 may combine if they stay under it, otherwise they
split.

1. **ADR + spec (governance).** ADR-0066 amendment (e): "authed player
   identity is account-scoped in the live game model; score attribution by
   `playerId`" — decision + threat model, superseding **ADR-0018 §6** for
   authed *live* identity and score attribution (it stands unchanged for
   anon and for the per-device `sessionId` transport). Update
   `docs/adr/INDEX.md` (registry-coherence gate). Bundle this spec doc.
2. **Schema-only.** `asyncapi.yaml` (+ `openapi.yaml` if needed); regenerate
   TS types. Gates: `openapi-lint`, `openapi-typescript-drift`.
3. **Game domain + application + migration.** `PlayerId` type; re-key
   `players` and `lockedPositions`; idempotent authed join (delete the
   seat-move); grace-by-`playerId`; mid-game rebind re-key; Postgres
   migration. Konsist + unit/property tests.
4. **Game API.** Wire mapping; broadcast `playerId`; `playerLeft` on last
   session; kick by `playerId`. Includes the two-cookie integration test
   (verification §1–4).
5. **Frontend.** Group roster + score + board tint by `playerId`; "you" =
   your account (`userId` when authed, else `sessionId`); MSW handlers;
   update `PlayerStrip` / `ResultatsScreen` / `lobbyView` and their tests.

## Non-goals

- Any change to **anonymous** identity — a guest on two devices remains two
  guests (no shared identity exists to collapse).
- Re-keying **ownership** or **presence** on `playerId` (§5). Ownership
  already resolves cross-device via `ownerUserId`.
- Merging the two devices into one **cursor**, or any self-echo suppression
  (§6 guardrail) — the two sockets stay independent peers.
- Competitive/versus scoring, cross-game leaderboards, or per-letter
  personal authorship (all already out of scope per ADR-0102).

## References

- **ADR-0018 §6/§7/§9** — per-device `sessionId` model + two-tier authz +
  presence; this design amends §6 for authed live identity only.
- **ADR-0066(a)/(b)/(c)** — cross-device "Mes parties", authed rejoin,
  fresh-join `userId` stamping. This design is amendment (e).
- **ADR-0086** — board tint by word-completer (`lockedBy`).
- **ADR-0102** — co-op validated-letter score (`tallyValidatedLetters` over
  `lockedBy`).
- **ADR-0001 §1/§3** — one-workstream PRs, schema-first parallel PRs.
- **ADR-0003** — cross-language API contract (regenerated types).
