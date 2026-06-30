# Capability-based feature authorization (design)

> Status: draft for review · 2026-06-30 · scope: **uniform capability gating of
> the role-differentiating features** (hint, contribuer, billing). Ratified by
> ADR-0079; extends ADR-0060; relates to ADR-0078.

## Context

ADR-0060 made identity the single authorization authority that owns capabilities
and exposes them on `whoami` / `/v1/users/me`. ADR-0078 shipped the first
capability (`billing:subscribe`) and the posture: **identity owns capabilities,
the server enforces, the frontend gate is cosmetic.**

Today only billing follows that model. The hint and contribuer features still use
binary "authed vs anon" or ad-hoc per-endpoint gating, and the guest role has no
representation in `capabilitiesFor`. This spec turns capabilities into the single
feature-authorization primitive across all three role-differentiating features.

## Goals

- One policy function in identity (`capabilitiesFor`) that answers feature access
  for guest / player / maintainer.
- The hint, contribuer and billing gates all read from `capabilities`, never from
  role or auth-status directly.
- Server-side enforcement is the source of truth; frontend gates are cosmetic.
- No cross-context imports; consumers read capabilities from identity `whoami`
  exactly as billing already does.

## Non-goals

- **No new capabilities for universal features** (play daily/archive grilles,
  account, settings, legal). A capability is minted only where access differs by
  role.
- **No subscription-TIER gating** (free vs premium grilles) — that is a separate
  axis owned by ADR-0078, deferred with the offer.
- No DTO/schema change: `whoami` and `/v1/users/me` already serialize
  `capabilities: string[]`; new capabilities flow through automatically.
- No change to billing's already-enforced `billing:subscribe` gate.

## The capability matrix

`capabilitiesFor(role: Role?)` — `null` = unauthenticated guest:

| caller   | role         | capabilities                              |
|----------|--------------|-------------------------------------------|
| guest    | `null`       | `{}`                                      |
| player   | `PLAYER`     | `{ hint }`                                |
| maintainer | `MAINTAINER` | `{ hint, contribuer, billing:subscribe }` |

The set is minimal-by-design: three capabilities express the matrix exactly. A
player holds everything except `contribuer` and `billing:subscribe`; a guest
holds everything except `contribuer`, `billing:subscribe` and `hint`.

## Per-feature gate map

| feature   | capability          | guest | player | maintainer | frontend gate (cosmetic)                         | backend enforcement (source of truth)                                                   |
|-----------|---------------------|-------|--------|------------|--------------------------------------------------|-----------------------------------------------------------------------------------------|
| hint      | `hint`              | ✗     | ✓      | ✓          | `frontend/src/ui/components/auth/useHintGate.ts` | grid `POST /v1/puzzles/{id}/hints` — `grid/api/src/.../routes/PuzzleRoute.kt`            |
| contribuer| `contribuer`        | ✗     | ✗      | ✓          | `frontend/src/ui/routes/contribuer.lazy.tsx`     | survey rating/contributions/preferences routes (`SubmitRatingRoute`, `MeContributionsRoute`, `MePreferencesRoute`) |
| billing   | `billing:subscribe` | ✗     | ✗      | ✓ (test)   | `frontend/src/ui/v2/useBillingGate.ts` (already) | billing checkout/cancel endpoints (already, ADR-0078)                                    |

(`billing:subscribe` is maintainer-only during ADR-0078's test phase; GA
promotion broadens it — see ADR-0079 "Promotion note".)

## Implementation detail

### Identity — the policy (Wave 2, the barrier)

`identity/domain/.../user/Capability.kt` currently holds one enum entry
(`BILLING_SUBSCRIBE("billing:subscribe")`) and
`fun capabilitiesFor(role: Role): Set<Capability>`.

- Add two enum entries with stable kebab/colon-free wire ids:
  `HINT("hint")`, `CONTRIBUER("contribuer")`.
- Change the signature to `capabilitiesFor(role: Role?)` and handle the guest
  path:

  ```kotlin
  // null role = unauthenticated guest (ADR-0079); absent role never escalates.
  fun capabilitiesFor(role: Role?): Set<Capability> =
      when (role) {
          null -> emptySet()
          Role.PLAYER -> setOf(Capability.HINT)
          Role.MAINTAINER -> setOf(Capability.HINT, Capability.CONTRIBUER, Capability.BILLING_SUBSCRIBE)
      }
  ```

- Update `CapabilityTest.kt` for the new matrix (guest → `{}`, player → `{hint}`,
  maintainer → all three) and any `capabilitiesFor` callers (`WhoAmIUseCase`,
  `GetMeUseCase`). The callers always resolve a real `Role` from an
  authenticated user, so the `null` branch is exercised by the domain test, not by
  those use cases — but the nullable signature documents the guest contract in one
  place.

**`whoami` / `/me` auto-propagate.** `WhoAmIResponse` / `MeResponse` already
carry `role` + `capabilities: List<String>`; the new capabilities serialize with
no DTO or OpenAPI change. The drift gate is a no-op for this wave.

### Frontend — cosmetic gates (Wave 3)

The frontend already has `useCapability(cap)`
(`frontend/src/ui/components/billing/useCapability.ts`), which reads
`useOptionalAuth().state.whoami.capabilities`, and `useBillingGate.ts` as the
established capability-gate pattern.

- Generalise the `useBillingGate` shape into a capability-driven gate (or point
  the existing per-feature gates straight at `useCapability`).
- Refactor `useHintGate.ts` to gate on `useCapability('hint')` instead of the raw
  authed/anon check. Net behavior is unchanged for guests (no `hint` ⇒ deny) and
  authed players (hold `hint` ⇒ allow), but the gate is now capability-explicit.
- Gate the `/contribuer` route/section (`contribuer.lazy.tsx`) on
  `useCapability('contribuer')` — maintainer-only. This removes the player-visible
  "Corriger" entry.
- Billing stays as-is.

### Survey — contribuer enforcement (Wave 4)

Survey already calls identity for session verification:
`survey/.../identity/IdentityClient.kt` + `CachedSessionVerifier.kt`, where
`verify(cookie) → UUID?` returns only the user id. Billing's
`IdentityClient.SessionPrincipal(userId, capabilities)` is the proven shape to
mirror.

- Extend survey's `IdentityClient` / `CachedSessionVerifier` to parse and carry
  `capabilities` from identity `/v1/auth/whoami`, returning a principal
  `(userId, capabilities)` (absent capabilities ⇒ empty set ⇒ deny).
- Enforce the `contribuer` capability (maintainer-only) on the write endpoints:
  `SubmitRatingRoute` (the rating POST, previously anon-allowed),
  `MeContributionsRoute`, `MePreferencesRoute`. A caller without `contribuer`
  gets `403`.
- Keep the 30 s cache already used for session verification.

### Grid — hint enforcement (Wave 4)

`grid/application/.../auth/WhoAmI.kt` is currently `(userId, displayName)` only.

- Extend `WhoAmI` to carry `capabilities` (parsed from identity `whoami`, same
  source the session verification already uses).
- Assert the `hint` capability on `POST /v1/puzzles/{id}/hints`
  (`PuzzleRoute.kt`). The boundary coincides with today's authed-only behavior
  (every authed role holds `hint`), so net behavior is unchanged; the change keeps
  the gate correct if `hint` later diverges from "all authed".

## Cross-context posture

Every enforcing context reads capabilities from identity `/v1/auth/whoami` — the
same round-trip it already makes for session verification — and never imports
identity. A missing/absent `capabilities` field deserialises to the empty set, so
a parse failure denies rather than escalates. This is exactly billing's
`SessionPrincipal` posture, generalised.

## Open decisions (flagged for maintainer review)

1. **Contribuer becomes maintainer-only** — anonymous + player rating is removed.
   Low present impact (contribuer is unregistered post-cutover, ADR-0074), but it
   narrows the crowdsourcing/training pipeline. Confirm intent.
2. **Minimal capability set** vs minting capabilities for universal features.
   Chosen minimal; revisit if per-feature gating of universal surfaces is wanted.
3. **Billing GA promotion** (ADR-0078): players must gain subscribe access at GA
   — grant `billing:subscribe` to `PLAYER` and/or switch the abonnement gate to
   is-authenticated. Deferred to the GA flip, not this rollout.

## Testing

- **Identity domain (Wave 2):** TDD the full matrix in `CapabilityTest.kt`
  (guest/player/maintainer), near-100% mutation; the `null` branch is a first-class
  case.
- **Frontend (Wave 3):** update gate tests so hint and contribuer assert against
  `useCapability`, not raw auth; vitest + Testing Library; a11y unchanged.
- **Survey/grid (Wave 4):** TDD that a caller lacking the capability gets `403`
  (survey contribuer) / `401`-or-`403` (grid hint) and a holder passes;
  property-based parse tests for the capability deserialisation (absent ⇒ deny);
  Konsist-clean, no cross-context imports.
