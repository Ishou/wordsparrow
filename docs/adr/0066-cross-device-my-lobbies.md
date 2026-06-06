# ADR-0066: Cross-device "Mes parties" list for authenticated players

## Status

Proposed

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
  must cover two shapes on one path. ADR-0003 §6 "routes mean what
  their path says" applies — pathful intent is part of the contract.
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
- **ADR-0003 §6** — wire conventions: pathful intent and identifier
  format.
