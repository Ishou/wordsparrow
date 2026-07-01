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
