# ADR-0066: Cross-device "Mes parties" list for authenticated players

## Status

Accepted

## Context

ADR-0018 §6 keys the multiplayer game model to a per-browser `sessionId`
(UUID v7 in `localStorage`). The Accueil "Mes parties" surface
(ADR-0039 amendment 2026-05-12) is populated by
`GET /v1/sessions/{sessionId}/lobbies` (`game/api/openapi.yaml:185`),
which returns the lobbies whose seats are bound to that one sessionId.
The frontend loader hard-codes that endpoint with
`context.getSession().sessionId`
(`frontend/src/ui/routes/accueil.tsx:635`).

The identity bounded context (ADR-0044, ADR-0060) added cookie-authed
sign-in. The seat-rebind path (`POST /v1/lobbies/players/rebind`,
`game/api/openapi.yaml:276`) stamps the authenticated `userId` onto
every seat whose `sessionId == anonSessionId` AND whose `userId` is
still null. The data model on the server therefore already carries a
stable user identifier per seat — what is missing is a read path that
uses it.

Symptom observed in production (2026-06-06): a single human signed
into two browsers (MacBook + PC) sees two different "Mes parties"
lists, because each browser holds its own anonymous `sessionId` in
`localStorage`. Auth does not unify the lists; rebind only attaches
the *current* device's anon sessionId to the user — there is no read
path that unions across every device that has ever signed in as that
user.

## Decision

### 1. New endpoint: `GET /v1/users/me/lobbies`

Add a user-scoped read to `game/api/openapi.yaml`. Cookie-authed
(`sessionCookie`); returns the union of `LobbySummary` rows for every
seat where `userId == cookie.userId`, ordered by `lastActivityAt`
descending (identical shape and ordering rules to
`listLobbiesForSession`). Empty array when the user owns or has joined
nothing — never 404, mirroring the session-scoped path's
information-disclosure rule. `401` when the cookie is missing,
expired, or rejected by identity-api.

`operationId`: `listLobbiesForUser`. Tag: `users`.

### 2. Frontend loader picks endpoint by auth state

The Accueil route loader calls `LobbyClient.listMyLobbiesForUser()`
when `auth.status === 'authed'`, falling back to
`listMyLobbies(sessionId)` otherwise. Both endpoints return the same
`LobbySummary[]` shape so `MyLobbiesSection` stays unchanged.

### 3. No data migration

The `userId` column on the lobby-seat row (added by the seat-rebind
work in ADR-0044's wake) is the join key. This ADR is a query
addition, not a schema migration.

### 4. Existing session-scoped endpoint is retained

`GET /v1/sessions/{sessionId}/lobbies` remains the anon read path,
unchanged — anonymous players, RGPD erasure flows
(`DELETE /v1/sessions/{sessionId}`), and contract tests all keep
their current shape.

## Consequences

### Easier

- A signed-in player sees the same "Mes parties" on every device. The
  invariant "same auth ⇒ same list" holds, which is what every user
  expects from a logged-in state.
- The seat-rebind path (already on the wire since the identity
  rollout) becomes mechanically load-bearing for the read side,
  rather than a write-only operation whose value is invisible to the
  player.

### Harder

- One new route to maintain in game-api (Ktor handler + Konsist
  architecture coverage + contract test against the spec).
- Two read paths to keep in sync as `LobbySummary` evolves.
  Mitigation: the shape is a shared component schema in the spec, so
  both routes inherit changes automatically.

### Different

- Read authority diverges by auth state: anon read is session-scoped,
  authed read is user-scoped. The loader picks; the component stays
  single-shape. This split is intentional and follows the ADR-0044
  identity boundary (per-device anonymous vs per-user authenticated)
  faithfully.

## Alternatives considered

- **Server-side union on the existing endpoint.** Have
  `GET /v1/sessions/{sessionId}/lobbies` return its own session plus
  every session ever rebound under the same user when the request is
  cookie-authed. **Rejected**: the route name lies about its scope;
  the semantics change based on whether a cookie is attached; tests
  must cover two shapes on one path.
- **Sync sessionId on sign-in.** Overwrite `localStorage`
  `bliss.session.id` with a canonical user-scoped UUID inside
  `AuthProvider.onAuthed`. **Rejected**: breaks in-flight WS
  reconnect frames (they carry the pre-sign-in sessionId), invalidates
  the rebind premise (the old `anonSessionId` is the join key), and
  forces a divergence between the WS-frame sessionId and the
  REST-loader sessionId during the transition.

## Implementation

Schema-first per ADR-0001 §3 and ADR-0003 §8: the spec change merges
first, then the producer (Kotlin) and consumer (TS) implementation
PRs land in parallel.

1. **Schema-only PR.** Append the operation to
   `game/api/openapi.yaml`; `pnpm api:check` regenerates
   `frontend/src/infrastructure/api/game/types.ts`; CI gates
   `openapi-lint` + `openapi-typescript-drift` enforce the contract.
2. **`feat(game-api): listLobbiesForUser route + use case`** —
   Ktor handler, application use case
   `ListLobbiesForUserUseCase`, repository port method
   `findByUserId`, contract test against the spec's `examples/`.
3. **`feat(frontend-game): pick user-scoped endpoint when authed`** —
   `LobbyClient.listMyLobbiesForUser()` method on the port; HTTP
   adapter; Accueil loader branch keyed on `auth.status`; MSW handler
   covering both 200 (with data) and 401 paths.

## References

- **ADR-0018 §6** — per-browser anonymous `sessionId` model that this
  ADR adapts for authenticated players.
- **ADR-0044** — identity bounded context for player OIDC; introduced
  the `userId` join key this ADR queries on.
- **ADR-0060** — identity user roles; clarifies the cookie-authed
  principal shape consumed by `sessionCookie`.
- **ADR-0001 §3** — schemas-first parallel-PR workflow.

## Amendment 2026-07-05 — owner-visibility parity

### Problem the original decision missed

§1 defines the user-scoped union purely over seats where
`userId == cookie.userId`, and §3 declared "No data migration". Both
assumptions break for the one case that matters most on this surface: a
lobby the signed-in player owns.

Authed players are the only ones who can create a lobby (ADR-0083 gates
`POST /v1/lobbies` on a valid cookie), so the `À plusieurs` tab always
loads via this user-scoped path. But the owner's `lobby_players` seat is
DELETED by the 30s WebSocket reconnect grace — `LeaveLobbyUseCase`,
dispatched from `LobbyWebSocketRoute` when the owner navigates away or
closes the tab. Other joiners have `user_id = NULL` (the join path never
stamps a `userId` onto their seats). So once the owner's leave-grace
elapses, **no seat in the lobby carries the owner's `userId`**, and
`findByUserId` — which, unlike `findBySessionId`, has no owner arm —
returns nothing. The started lobby disappears from the `À plusieurs` tab
permanently. Observed in production 2026-07-05, reproducing on every
return visit.

The session-scoped path is unaffected because `findBySessionId` already
carries an owner arm (`WHERE l.owner_session_id = ? OR EXISTS(seat.session_id = ?)`)
that keeps the lobby visible after the leave-grace drops the owner seat.
The user-scoped path structurally cannot mirror it: there is no
`owner_user_id` to match against.

### Decision

Add a nullable `owner_user_id` column on `lobbies`, set once at lobby
creation and never overwritten by a later save (deriving it from the
owner's seat at save time is wrong — that seat is exactly what the leave
we are fixing deletes). Give `findByUserId` an owner arm —
`WHERE (owner_user_id = ? OR EXISTS(seat.user_id = ?))` — mirroring the
existing `findBySessionId` owner arm. Legacy anon-owned rows keep
`owner_user_id = NULL`; ADR-0083 makes every new lobby authed, so in
practice the column is always set going forward.

### Supersession

This supersedes §3 ("No data migration") for this follow-up. A single
additive, backward-compatible migration is required — expand-and-contract:
the column is nullable, no existing row is rewritten, and the read arm
tolerates `NULL`. The migration lands in the implementation PR that this
amendment governs (ADR-0001 §7: this ADR merges first).

## Amendment 2026-07-05 (b) — authed cross-device rejoin

### Problem the original decision missed

The (a) amendment fixed the READ path: an authed user now SEES a lobby
they own or joined from any device, because `findByUserId` gained an
owner arm keyed on `owner_user_id`. But the JOIN path was left untouched
and remains `sessionId`-only. `JoinLobbyUseCase` recognizes an
owner/member solely by `sessionId` — `hasJoined(sessionId)` for the
reconnect bypass, `isOwner(sessionId)` for the owner bypass, otherwise
the `code != lobby.code.value` check that yields `WrongCode`.

Rejoining from the `À plusieurs` tab sends no code (the user does not
have it; it belongs to the original host device). On a second device the
current `sessionId` is neither the stored `ownerSessionId` nor any
existing seat's `sessionId`, so the join falls through to the code check
and the server rejects with `WrongCode` ("demandez le code à
l'organisateur"). The net user-visible bug: **you can see your
cross-device lobby but cannot rejoin it.** Confirmed in production
2026-07-05.

### Decision

The socket already cookie-verifies on connect and binds
`whoAmI.userId` to the connection (`LobbyWebSocketRoute`, via
`sessionManager.bindUserId`). Thread that server-verified `userId` into
the join.

1. **The WebSocket join passes the socket's server-verified `userId`**
   — obtained from the connect-time identity-api cookie verification,
   **never** read from the client join frame — into `JoinLobbyUseCase`.
   `dispatchJoin` currently calls `joinLobby(lobbyId, sid, pseudo, code)`
   without it.

2. **Recognition rules**, evaluated inside the mutator BEFORE the code
   check (so they preserve the existing reconnect/owner bypass posture):

   - `userId == lobby.ownerUserId` → **owner rejoin**: rebind
     `ownerSessionId` to the caller's current `sessionId`, upsert the
     owner's seat (stamped with `userId`), bypass the code. Rebinding
     `ownerSessionId` is what keeps every existing `isOwner(sessionId)`
     check — StartGame, RotateCode, SetGridConfig, kick — working
     unchanged: no per-use-case auth edit is needed.
   - `userId` matches an existing seat's `userId` → **member rejoin**:
     seat the current session (stamped with `userId`), bypass the code.
   - otherwise → **unchanged**: anon/guest callers still need a valid
     code; the `WrongCode` failure is preserved verbatim.

### Threat model (required — auth-boundary change, CLAUDE.md)

STRIDE pass over the new recognition arms:

- **Spoofing / forged identity** *(Spoofing)*: the `userId` is taken
  from server-side cookie verification (identity-api whoami) performed at
  connect time, never from the client frame. A client cannot assert a
  `userId` it did not authenticate as, so the owner/member arms cannot be
  driven by a forged value. This is strictly stronger than the existing
  `sessionId` credential, which *is* client-supplied (ADR-0018 §7).
- **Elevation of privilege**: matching `owner_user_id` is stronger proof
  of entitlement than knowing the shareable join code — a cookie the
  identity provider issued to that user, versus a short string anyone
  with the URL can be told. The member arm grants exactly the capability
  a code-holder already has (a seat); it adds no new capability. The
  owner arm additionally rebinds ownership, but **only** the
  cookie-verified owner (`userId == ownerUserId`) can trigger it — no
  code-holder, anon, or other authed user reaches that branch.
- **Reconnect-window takeover** *(EoP)*: unchanged. A different
  `sessionId` presenting a non-matching `userId` still joins only as a
  regular player and never inherits owner status (ADR-0018 §7 posture
  intact).
- **Information disclosure / enumeration** *(Info disclosure)*: none.
  Join still requires knowing the `lobbyId`, exactly as today; no arm
  leaks lobby existence or lets an attacker probe the `owner_user_id`
  space. Anon and guest flows are byte-for-byte unchanged.

Residual risk is bounded by the identity cookie's own integrity — the
same trust root the (a) amendment's read path already relies on.

### Consequences

- **Ownership FOLLOWS the authed owner's current device on rejoin.**
  When the owner returns from a second device, `ownerSessionId` is
  rebound to that device's session. It is the same human, so this is
  invisible to the user, but it is a deliberate, bounded exception to
  ADR-0055 §f's rule that **ownership transfer happens only via RGPD
  erasure** (`EraseSessionUseCase`; see also `LeaveLobbyUseCase`'s
  header). The distinction: ADR-0055 §f forbids transferring ownership to a
  *different principal*; this rebind keeps ownership with the *same*
  authenticated `userId` and merely moves which `sessionId` represents
  them. Documented here and cross-referenced from ADR-0055 §f's intent.
- **Owner-gated use cases are untouched.** Because the rebind updates
  `ownerSessionId`, StartGame / RotateCode / SetGridConfig / kick keep
  their `isOwner(sessionId)` guards verbatim — zero auth surface added
  outside `JoinLobbyUseCase`.
- **Localized change.** The edit is confined to the join path
  (`LobbyWebSocketRoute.dispatchJoin` + `JoinLobbyUseCase`); no schema
  change, no new endpoint, no migration beyond the `owner_user_id`
  column the (a) amendment already introduces.

### References (this amendment)

- **ADR-0018 §7** — the `sessionId` two-tier authz surface this
  amendment strengthens with a server-verified `userId`.
- **ADR-0055 §f** — "ownership transfer only via RGPD erasure"; this
  amendment documents the same-principal owner-rebind as a bounded
  exception.
- **ADR-0083** — hosting entitlement; every new lobby is authed, so
  `ownerUserId` is populated in practice.

## Amendment 2026-07-09 (c) — fresh authed join stamps the seat userId

### Problem the original decision missed

Amendment (a) noted in passing that "other joiners have `user_id = NULL`
(the join path never stamps a `userId` onto their seats)" and treated
that as immutable, adding an `owner_user_id` arm to `findByUserId` to
work around it for the owner. But it breaks the co-player case that
amendment (b) enabled: once an owner **explicitly relinquishes**
(ADR-0098 §2, `owner_user_id → NULL`), a seated authed co-player's
`/grilles` (`À plusieurs`) list — served by the user-scoped
`findByUserId` — no longer matches the lobby on **either** arm: the
`owner_user_id` is null and the co-player's own seat still carries
`user_id = NULL` because their fresh authed join never stamped it. The
now-ownerless game vanishes from the co-player's list, so the ADR-0098
§6 claim affordance can never appear. Confirmed 2026-07-09.

The rebind path (`rebindAnonSeats`) only stamps `userId` on the
**anon→authed sign-in** transition; a player who is already signed in
when they join a lobby never triggers it, so their seat stays
`user_id = NULL` forever.

### Decision

`JoinLobbyUseCase`'s fresh-join arm stamps the socket's server-verified
`userId` (the same value amendment (b) already threads in, never read
from the client frame) onto the new seat. Anon/guest joins pass `null`
and are byte-for-byte unchanged.

### Threat model (auth-boundary-adjacent, CLAUDE.md)

No new capability: the `userId` is already cookie-verified at connect
time and threaded into `JoinLobbyUseCase` by amendment (b); this only
persists it on the seat the joiner already holds. A code-holder gains
exactly the seat they already had, now discoverable cross-device.
Spoofing is bounded by the identity cookie's integrity — the same trust
root amendments (a)/(b) rely on. Owner-keyed quota lookups
(`findActiveByOwnerUser`, `findWaitingByOwnerUser`) read the **owner**
seat's `userId`, so stamping a co-player seat does not perturb them.

### Consequences

- A seated authed co-player sees, and can claim, an explicitly
  relinquished game from `/grilles`.
- The `owner_user_id` arm added by amendment (a) is retained: it still
  covers the window between the owner's leave-grace dropping their seat
  and any co-player action.

## Amendment 2026-07-14 (d) — authed seats take the verified display name

### Problem the original decision missed

Amendment (b) threads the connect-time verified `userId` into
`JoinLobbyUseCase` "never from the client frame", but the seat's
**pseudonym** was still taken verbatim from the client `joinLobby`
frame (`LobbyWebSocketRoute` → `Player(sessionId, pseudonym, …)`). The
REST create path (`LobbiesRoute`) already overrides it with the
verified `WhoAmI.displayName`, so the two paths disagreed: an
authenticated player whose account display name differs from the local
per-browser guest pseudonym (`bliss.session.pseudonym`, a random animal
name) was seated under the **guest** name on the WS path. Two symptoms,
both confirmed in prod (2026-07-14):

- **Persistent**: when the host's seat is freed by the ADR-0018 §5
  reconnect grace and they reconnect, the owner-re-entry arm re-seats
  them from the client frame — overwriting the account name with the
  guest name in the authoritative lobby and the `playerJoined`
  broadcast.
- **Transient**: the frontend `withLocalPlayer` fallback (which
  synthesizes the local seat during the pre-join snapshot gap) drew the
  pseudonym from the local guest session, flashing the guest name until
  the real re-seat frame landed.

### Decision

`JoinLobbyUseCase` seats an authed socket under the connect-time
server-verified `WhoAmI.displayName` (threaded like the `userId` in
(b)), falling back to the client-frame pseudonym only for anon joins.
This aligns the WS path with REST create. The frontend fallback mirrors
it: `withLocalPlayer` uses `auth.whoami.displayName` for an authed user,
the local guest pseudonym otherwise.

### Threat model (auth-boundary-adjacent, CLAUDE.md)

Strictly tighter than before: an authed client can no longer present a
spoofed display name over the wire — the seat name is now bound to the
identity cookie, the same trust root as (a)/(b). No new capability; anon
joins are byte-for-byte unchanged. In-lobby rename (`RenameSelf`) is
unchanged and still permitted; a subsequent authed reconnect re-seats
under the account name, matching how the REST-created host already
behaved.

## Amendment 2026-07-23 (e) — account-scoped live player identity

### Problem the original decision missed

Amendment (b) recognizes an authed rejoin from a second device and **moves**
the seat rather than duplicating it (`JoinLobbyUseCase.seat`'s
`withoutStaleSeat` filter). But the move is never expressed on the wire as a
removal: the join emits only `PlayerJoined(newSessionId)` — there is no
`PlayerLeft(oldSessionId)` — and `handleOutcome` broadcasts that single event
to every socket. The frontend roster reducer dedupes by `sessionId` only, so it
appends the new row without dropping the old one. Both devices render `{S1,
S2}`. Because identity and score are still keyed on the per-device `sessionId`
(ADR-0018 §6; score = `count(lockedPositions where lockedBy === sessionId)`,
ADR-0102 over ADR-0086 attribution), each phantom row carries its own count.

Net user-visible bug, confirmed 2026-07-23: **a single account joining the same
lobby from mobile + desktop appears twice, with two separate scores**, and a
device switch orphans the earlier device's contributions. The identity cookie
is not implicated — `__Secure-ws_session` is `Domain=wordsparrow.io`, reaches
the `game.wordsparrow.io` WS handshake, and the de-dup fires; the defect is that
identity and score are device-scoped rather than account-scoped, and the seat
move is invisible to peers.

### Decision

For **authenticated** players the live game model is **account-scoped**. Anon
players are unchanged (still per-device).

1. **Stable `PlayerId`**, derived once per socket at the WebSocket edge from
   server-verified inputs: `playerId = verifiedUserId?.value ?: sessionId.value`
   (authed → the account `userId`; anon → the device `sessionId`). Derived from
   the connect-time identity-api cookie verification, **never** from a client
   frame.
2. **Roster re-keyed on `PlayerId`.** `Lobby.players` becomes
   `Map<PlayerId, Player>`; join is an idempotent upsert on `playerId`. A second
   device of the same account maps to the same key — a structural no-op. This
   **deletes** the amendment (b) `withoutStaleSeat` seat-move (with it, the
   missing-`PlayerLeft` duplication and the two-device ping-pong).
3. **Score re-keyed on `PlayerId`.** `lockedPositions` becomes
   `Map<Position, PlayerId>` and the wire `lockedBy` becomes a `PlayerId`, so an
   account's locks aggregate into one score across devices and across a device
   switch. ADR-0086 board tint-by-finder (same `lockedBy`) becomes account-scoped
   consistently — the ADR-0102 invariant "score equals the count of your coloured
   cells" is preserved.
4. **Reconnect grace removes on last session.** After the grace window a player
   is removed only when no live socket remains for its `playerId` (extends the
   existing per-`sessionId` multi-tab check in `SessionManager` to `playerId`).
   Closing one device while another stays connected does not drop the account.

**Explicitly unchanged (bounded blast radius):** ownership stays keyed on
`ownerSessionId` + `ownerUserId` (amendment (b) already rebinds owner
cross-device) — `isOwner`, StartGame, RotateCode, SetGridConfig, kick keep their
guards verbatim; kick's *target* becomes a `playerId`. Presence/cursors stay
per-session and ephemeral. The `cellUpdate`/`cellUpdated` sync transport stays
per-device, with **no self-echo suppression keyed on `playerId`** — that is the
one change that would break mobile↔desktop input reflection.

### Threat model (auth-boundary change — required, CLAUDE.md)

- **Spoofing:** the authed `playerId` derives from the server-verified `userId`
  (identity-api whoami at connect time), never from a client frame — a client
  cannot present another account's `playerId`. Anon `playerId = sessionId` is
  client-supplied exactly as today (ADR-0018 §7); no regression.
- **Elevation of privilege:** none. Ownership and every owner-gated use case keep
  their existing `isOwner(sessionId)` / `ownerUserId` guards. The re-key adds no
  capability; it only collapses roster rows and score buckets for one verified
  account.
- **Information disclosure:** none new. Join still requires the `lobbyId`; no arm
  leaks lobby existence. An anon player's exposed `playerId` is their own
  `sessionId` (already on the wire); an authed player's is their `userId`,
  visible only to co-players already in the lobby.
- Residual risk is bounded by the identity cookie's integrity — the same trust
  root amendments (a)/(b)/(c)/(d) rely on.

### Supersession

Supersedes **ADR-0018 §6** for authed *live* identity and score attribution
only. §6 stands unchanged for anonymous players and for the per-device
`sessionId` transport (cell sync, presence, cursors). One additive,
backward-compatible migration (`V4`, expand-and-contract): `lobby_players` is
DELETE+INSERT full-rewritten per save, so re-keying needs no row-dedup backfill;
`game_payload` `lockedBy` is read forward-compatibly (a legacy `sessionId` value
reads as a `PlayerId`; anon values are already correct; authed in-flight locks
self-heal on the next lock).

### References (this amendment)

- **ADR-0018 §6/§7/§9** — per-device `sessionId` model, two-tier authz, presence;
  this amendment scopes §6 to anon + transport only.
- **ADR-0086** — board tint by word-completer (`lockedBy`).
- **ADR-0102** — co-op validated-letter score (`tallyValidatedLetters` over
  `lockedBy`).
- Design + wave plan:
  `docs/superpowers/specs/2026-07-23-multiplayer-account-player-identity-design.md`,
  `docs/superpowers/plans/2026-07-23-multiplayer-account-player-identity.md`.
