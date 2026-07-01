# ADR-0083: Multiplayer hosting entitlement

## Status
Accepted

Extends ADR-0080 (subscription offer + subscription-derived entitlement) into the
`game` bounded context. Builds on ADR-0079 (capability-based feature
authorization) and ADR-0018 (game context + realtime). Relates to ADR-0029
(lobby ownership + join codes) and ADR-0078 (billing, dark-launched).

## Context
ADR-0080 ratified the subscription offer for **solo** grilles (free: today + last
7 days + started; subscriber: all + on-demand generation) but said nothing about
**multiplayer**. Today, creating a lobby ("Jouer à plusieurs") is **ungated**:
both signed-in and anonymous callers can create one via `LobbiesRoute` (there is
an explicit anon create path), each backing a fresh grid from grid's stateless
`GET /v1/puzzles/{id}`.

Two structural facts shape the decision:
- `CreateLobby` is **already idempotent per `SessionId`** — a caller who owns a
  WAITING lobby gets that one back rather than a second (`findWaitingByOwnerSession`).
  The limit is per-session, not per-user, and does not distinguish free from
  subscriber.
- game verifies the session cookie (`CookieVerifier` → `WhoAmI{userId,
  displayName}`) but does **not** read capabilities. identity already serializes
  `capabilities` on `whoami` (ADR-0079), so game can consume them exactly as
  grid/survey/billing do.

## Decision
Multiplayer **hosting** (creating a lobby) is entitlement-gated. **Joining** (via
link/code) stays open to everyone, including guests — link-shared games keep
working for signed-out players.

Host quota by tier:
- **Guest** (no session) — **0**. Hosting requires a signed-in player. The anon
  create path is removed; an anonymous `POST /v1/lobbies` returns `401`.
- **Player** (signed in, free) — **1 open lobby**, where "open" = a WAITING
  lobby. The existing return-your-existing-lobby behavior is kept but keyed per
  **userId**: tapping host again reopens their waiting lobby — frictionless, no
  error. Once that lobby's game starts (or it is closed/expired), they may host
  again.
- **Subscriber** — **unlimited**. Subscribers bypass the one-open-lobby dedup and
  always mint a new lobby.

Mechanism (per ADR-0079 — consumers ask capabilities, never tiers):
- identity `capabilitiesFor(role, tier)` mints a new **`multiplayer:host-unlimited`**
  capability for the **subscriber** tier only. A dedicated capability — rather
  than reusing the grid-domain `grilles:all` cross-context — keeps the semantics
  honest.
- game's `WhoAmI` gains `capabilities`; `CreateLobby` reads it: authenticated ⇒
  may host (quota 1 open lobby); `multiplayer:host-unlimited` present ⇒ unlimited.

Timing: **guest = 0** and **player = 1** ship immediately — sensible anti-spam,
independent of billing GA. **subscriber = unlimited** is dormant until
subscriptions open to players; today only the maintainer holds the subscriber
tier (billing is dark-launched, ADR-0078).

## Threat model

**Assets:** the lobby-create endpoint (`POST /v1/lobbies`), the per-user host
quota, the `multiplayer:host-unlimited` capability.

**Threat actors:** unauthenticated guests attempting to host anyway; authenticated
players attempting to exceed the one-open-lobby quota; a caller attempting to
claim the subscriber-only capability without holding it.

**Attack vectors and mitigations:**

- **Capability parse failure → privilege escalation:** game's `WhoAmI` gains
  `capabilities` following the same shape as grid/survey/billing. An absent or
  malformed `capabilities` field on identity's `whoami` response deserializes
  to an empty set, so `multiplayer:host-unlimited` is never granted by a parse
  gap — deny-only, matching ADR-0079 §6's posture.
- **Quota-check TOCTOU:** the per-user "1 open lobby" check must not race a
  concurrent create from the same user into minting two WAITING lobbies. game
  already has the primitive for this: `LobbiesRoute`'s authed-create path runs
  `createLobby(...)` inside `coordinator.withUserLock(whoAmI.userId) { ... }`
  (`PostgresLobbyWriteCoordinator`, a `pg_advisory_xact_lock` per `userId`),
  the same lock that today serializes create against the `user.deleted`
  freshness check. The new `findWaitingByOwnerUser` lookup lands inside that
  same lock scope — no new locking primitive, just the quota check moving
  from `findWaitingByOwnerSession` to `findWaitingByOwnerUser` at a call site
  already serialized per user. Guests are rejected with `401` before any lock
  is taken, so there is no race to close on that path; subscribers mint
  unconditionally and have no quota to race.
- **Capability forgery/replay:** `multiplayer:host-unlimited` is read from the
  session principal game fetches server-side from identity's `whoami`
  (`HttpCookieVerifier`), never from client-supplied input. The existing 30 s
  `cacheTtl` on that verifier (matching ADR-0079 §6) bounds how long a
  downgraded subscriber can keep hosting past cancellation; the authed-create
  path already calls `verifyFresh` to close the equivalent stale-cache window
  for `user.deleted`, and capability checks ride the same fetch.

**Out of scope:** identity authentication flows (ADR-0044, ADR-0060);
subscription-tier billing/payment integrity (ADR-0078).

## Consequences
- **Behavior change, live on ship:** signed-out players can no longer host — the
  most visible change. They keep full join access, so link-shared games still
  work. The host affordance must prompt sign-in rather than silently fail.
- game becomes a **capability consumer**, matching grid/survey/billing; its
  session `WhoAmI` carries `capabilities`.
- A new `multiplayer:host-unlimited` capability enters `capabilitiesFor`; the
  subscriber capability set grows. No tier is ever exposed to a consumer.
- The one-open-lobby limit moves from per-session to per-user; a small
  `findWaitingByOwnerUser` port + adapter is added, subsuming per-session
  idempotency.
- Enforcement is **server-side** in `game` — unlike the still-cosmetic solo grid
  access gating (the open, separate W5b work), the create endpoint denies/limits
  regardless of client. Ungated solo grid generation remains a separate concern,
  out of scope here.
