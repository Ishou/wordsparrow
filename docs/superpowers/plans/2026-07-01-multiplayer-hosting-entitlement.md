# Plan: Multiplayer hosting entitlement (ADR-0083)

Guest = 0 lobbies, player = 1 open (WAITING) lobby, subscriber = unlimited.
Joining stays open to everyone. Server-side enforced in `game`. See ADR-0083.

## Waves

| Wave | PR(s) | What |
|------|-------|------|
| 1 | this PR | ADR-0083 + this plan (governance). |
| 2 | identity | Add `multiplayer:host-unlimited` to `capabilitiesFor(role, tier)` for the **subscriber** tier only. Update `Capability.kt` + tests. No whoami/me DTO change (capabilities is an open string list). Schema barrier — must land before Wave 3 reads it. |
| 3 | game | Enforcement (server-side). |
| 4 | frontend | Guest host affordance → sign-in prompt; joining unchanged. |

### Wave 3 — game (the core)
- **Capabilities into the session:** `WhoAmI` (`CookieVerifier`) gains
  `capabilities: Set<String>`; `HttpCookieVerifier` parses them from identity
  `whoami` (mirrors grid `HttpCookieVerifier` / billing `IdentityClient`).
  Absent ⇒ empty ⇒ deny-only, never escalate.
- **Guest = 0:** remove the anon create path in `LobbiesRoute`
  (`createLobby(..., null)`); anonymous `POST /v1/lobbies` ⇒ `401` (RFC 7807).
  Guests keep `GET by-code`, join, and WS.
- **Player = 1 open lobby:** add `findWaitingByOwnerUser(userId)` port + in-memory
  + Postgres adapters; `CreateLobby` returns the caller's existing WAITING lobby
  keyed by userId (frictionless reopen), else mints one.
- **Subscriber = unlimited:** if `multiplayer:host-unlimited` ∈ capabilities,
  bypass the dedup and always mint.
- **Schema:** `game/api/openapi.yaml` — document `401` on `POST /v1/lobbies`.
- Join route + WS untouched. Konsist/arch unchanged (no cross-context imports;
  capabilities read over HTTP).

### Wave 4 — frontend
- «Jouer à plusieurs» host action: for guests, prompt sign-in to host (joining
  via code stays open); players/subscribers unchanged (reopen existing lobby).
- Tutoiement copy; no "vous". Screenshot-verify the guest state.

## Notes / decisions locked
- "1 lobby" = **1 WAITING lobby** (maintainer-confirmed 2026-07-01).
- At the limit → **reopen existing** (no hard block), maintainer-confirmed.
- Dedicated `multiplayer:host-unlimited` capability (not reuse of `grilles:all`).
- guest=0 / player=1 ship now (anti-spam); subscriber=∞ dormant until billing GA.
