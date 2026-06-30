# ADR-0079: Capability-based feature authorization

## Status
Accepted

Extends ADR-0060 (identity roles + capabilities). Relates to ADR-0078
(billing subscription context).

## Context
ADR-0060 introduced roles (`player`, `maintainer`; `guest` resolved at the edge
as "no session") and, in its 2026-06-30 amendment, made identity the single
authorization authority that owns **capabilities** and exposes them on `whoami`
and `/v1/users/me`. ADR-0078 shipped the first capability, `billing:subscribe`,
and established the posture that capabilities are owned by identity, enforced
**server-side**, and merely **cosmetic** on the frontend.

But that posture is only realised for billing. Most feature gating today is
still binary "authed vs anon" or ad-hoc per endpoint, not capability-driven:

- The hint feature gates on a raw auth check — frontend `useHintGate` (authed →
  allow, anonymous → deny) plus grid's `POST /v1/puzzles/{id}/hints` requiring a
  valid session cookie (401 otherwise).
- The contribuer (clue-quality rating) feature is ad-hoc in the survey context:
  `POST /v1/items/{itemId}/rating` allows anonymous ratings and only requires
  auth for the `correctif` field; `GET /v1/me/contributions` and
  `PATCH /v1/me/preferences` are authed-only; the frontend gates the "Corriger"
  action on being authed.
- Only billing is already capability-gated.

Anonymous "guest" users have no `Role` at all (a guest has no session and no
`identity_users` row). We want a single, uniform model where feature access is
**policy-defined in one place** (identity) and differentiated cleanly across
guest / player / maintainer — instead of three different gating idioms.

## Decision

1. **Capabilities are the single feature-authorization primitive.** Identity
   owns the role → capability mapping; every consumer asks "does the caller hold
   capability X?" and never branches on role or auth-status directly. This
   generalises ADR-0078's billing posture to all role-differentiating features.

2. **Generalize derivation to `capabilitiesFor(role: Role?)`**, where `null`
   means an unauthenticated guest. The mapping is:

   | caller            | role argument | capabilities                              |
   |-------------------|---------------|-------------------------------------------|
   | guest (no session)| `null`        | `{}`                                      |
   | player            | `PLAYER`      | `{ hint }`                                |
   | maintainer        | `MAINTAINER`  | `{ hint, contribuer, billing:subscribe }` |

3. **The capability set is the role-differentiating features only:** `hint`,
   `contribuer`, `billing:subscribe`. This minimal set expresses the matrix
   exactly — "a player has all capabilities except `contribuer` and
   `billing:subscribe`"; "a guest has all except `contribuer`, `billing:subscribe`
   and `hint`". **Universal features** — playing the daily/archive grilles,
   account, settings, legal pages — stay open and do **not** mint a capability. A
   capability is introduced only where access differs by role. **Subscription-TIER
   access** (free vs premium grilles) is a separate axis owned by ADR-0078 and is
   explicitly **out of scope** here.

4. **Guests need no new endpoint.** An anonymous caller has no session, so
   `whoami` still returns 401 (ADR-0060) and consumers resolve "no session" to
   guest. `capabilitiesFor(null) = {}` and the existing "anonymous ⇒ no
   capabilities" behavior on both the backend and frontend is already correct —
   no new guest-facing surface is required.

5. **Enforcement posture** (the server is the source of truth; frontend gates are
   cosmetic, mirroring ADR-0078):

   - **`billing:subscribe`** — already enforced at billing's endpoint edge
     (ADR-0078). **No change.**
   - **`hint`** — guests (no session) are denied; players and maintainers are
     allowed. The existing authed-only gate on grid's
     `POST /v1/puzzles/{id}/hints` already coincides with the HINT boundary
     (every authed role holds `hint`). Make it **capability-explicit** by carrying
     capabilities on grid's whoami principal, so the gate stays correct if `hint`
     later diverges from "all authed".
   - **`contribuer`** — **NEW policy: maintainer-only.** Today survey's contribuer
     endpoints allow anonymous ratings and authed corrections; under this ADR the
     `/contribuer` surface and its write endpoints require the `contribuer`
     capability (maintainer-only). Enforced server-side in survey by extending its
     session verifier to carry capabilities, mirroring billing's
     `IdentityClient.SessionPrincipal`.

6. **Cross-context capability source.** Contexts enforcing a capability read it
   from identity's `/v1/auth/whoami` (which already returns `capabilities`),
   exactly as billing's `IdentityClient` does — **no cross-context imports**. A
   30 s cache (as billing and survey already use for session verification) bounds
   the cost; **absent capabilities ⇒ empty set ⇒ deny** — the parse never
   escalates a missing field into a granted permission.

## Threat model

**Assets:** hint access (grid), `contribuer` write surface (survey).

**Threat actors:** unauthenticated guests and authenticated players attempting
to access maintainer-only surfaces (`contribuer`).

**Attack vectors and mitigations:**

- **Capability parse failure → privilege escalation:** an absent or malformed
  `capabilities` field on the `whoami` response deserialises to an empty set and
  the capability check denies — the parse cannot escalate a missing field into a
  granted permission (§6).
- **Frontend gate bypass:** server enforces capabilities independently;
  frontend gates are cosmetic and not the authority (§5). A caller that strips
  the frontend gate still hits a server-side capability check.
- **Capability forgery:** capabilities originate from identity's
  `/v1/auth/whoami`, not from the caller; no client-supplied capability field is
  accepted — the consumer reads capabilities from the session principal it
  fetched, not from request input.
- **Session replay / stale grant:** the 30 s TTL on each context's
  session-verification cache (§6) bounds the window during which a revoked or
  downgraded session can still pass a capability check.

**Out of scope:** subscription-TIER privilege escalation (ADR-0078); identity
authentication flows (ADR-0044, ADR-0060).

## Consequences

- **Easier:** the access policy lives in one function (`capabilitiesFor`); an
  access change is a mapping change, not an endpoint change; consumers are
  gate-agnostic and never learn *why* a capability is held.

- **Behavior change (FLAGGED for maintainer review):** contribuer (clue-quality
  rating) becomes **maintainer-only** — anonymous and player rating is removed.
  Contribuer is currently unregistered post-cutover (ADR-0074), so the present
  impact is low, but this narrows the crowdsourcing / training-data pipeline.
  Confirm intent on return.

- **Decision flagged for review:** the **minimal capability set**
  (`{ hint, contribuer, billing:subscribe }`) vs minting capabilities for
  universal features. Chosen minimal for simplicity; revisit if per-feature
  gating of universal features (e.g. account, settings) is ever wanted.

- **Promotion note (carries to ADR-0078 GA):** when billing leaves its test
  phase, players must be able to subscribe — that requires either granting
  `billing:subscribe` to `PLAYER`, and/or switching the abonnement page's gate
  from has-capability to is-authenticated (keeping `billing:subscribe` as the
  server-side checkout guard). Do this in the GA promotion, **not now**.

- **Harder:** contexts enforcing capabilities take a runtime dependency on
  identity `whoami` (already true for session verification, so no new dependency
  in practice).
