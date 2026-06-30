# ADR-0060: Identity user roles + `UserRoleChanged` event

## Status
Accepted

## Context
The survey context needs to give *maintainer-authored* correctifs gold training
weight (Specs B–D of the 2026-05-30 clue-gen gold-weighting rollout). That
requires distinguishing a maintainer from any other authenticated rater. Users
live in the identity bounded context; survey cannot import identity and learns
about users only through NATS events. We also anticipate other role-gated
features (admin/moderation/campaign control), so the primitive should be
reusable rather than single-use.

## Decision
Add a `role` column to `identity_users` (`player` default, `maintainer`) and a
`Role` domain type. Role changes publish a fire-and-forget `UserRoleChanged`
event on `wordsparrow.user.role-changed` (ADR-0049 posture), which survey (and
future consumers) cache.

Roles are assigned only by a configure-in-cluster Helm `post-install,post-upgrade`
bootstrap Job that runs the identity image with `--set-maintainer-roles` and a
configured `MAINTAINER_USER_IDS` list. There is deliberately **no HTTP
role-mutation endpoint** in this ADR.

### Threat model
- **Asset:** the `maintainer` role (confers gold training weight today; more
  later).
- **Mutation surface:** only the bootstrap Job. The id list is a chart value /
  k8s Secret, never code; a DB write needs cluster access. No runtime
  privilege-escalation path, no IDOR on a role route.
- **Event exposure:** internal NATS subject, NetworkPolicy-guarded; payload
  carries `userId`, `role`, `changedAt` — no secrets.
- **Event-loss failure mode:** tolerable. The Job re-runs on every
  `helm upgrade` (re-emitting only on actual change), and consumers must be
  idempotent with their own reconciliation. Delivery is not guaranteed.
- **Spoofing:** only identity publishes to the subject; consumers trust the
  in-cluster broker, as with `user.deleted`.

## Consequences
- Easier: a single reusable authz primitive for current and future role gates;
  survey can gate `training_weight` on a cached maintainer role.
- Harder: cross-context role propagation now has a contract to maintain
  (`UserRoleChanged`); consumers must handle best-effort delivery.
- Deferred: a runtime role-management API (YAGNI until a second assignment need).

## Amendment 2026-06-29: resolved `guest | player | maintainer` taxonomy + whoami role exposure

### Context
Downstream contexts (billing's maintainer-gated rollout per ADR-0078; the
frontend) need to know the calling user's role at request time. The stored role
(`player` default, `maintainer`) already exists but is **not** surfaced on the
HTTP edge — `whoami` returns only `userId` + `displayName`.

### Decision
- The **resolved role taxonomy is `guest | player | maintainer`.** `player` and
  `maintainer` remain the **stored** roles, unchanged — **no migration, no
  `UserRoleChanged` wire change.** `guest` is **not** a stored role (a guest has
  no session and no `identity_users` row); it is **resolved at the edge**: the
  absence of a valid session means guest.
- `whoami` and `/v1/users/me` gain a **`role`** field carrying the stored role
  (`player` | `maintainer`). `whoami` keeps returning **401 for anonymous**
  callers (grid/game depend on that for auth); consumers map "no session / 401"
  to `guest`. `guest` is therefore a consumer-side resolution, not a value
  `whoami` ever returns.
- Role **assignment** is unchanged: still the bootstrap-Job-only path from the
  original decision. There is still **no HTTP role-mutation surface.**

### Threat model (delta)
- **New exposure:** a caller can now read **their own** role. Low risk — the
  role is not a secret, it is the caller's own attribute, and it confers nothing
  by being *read*. No cross-user read (no role on another user's behalf), no
  escalation (assignment surface unchanged), no new mutation path.
- **Gating still enforced server-side** in each consumer; `whoami`'s `role` is an
  input to those checks, never the enforcement itself.

### Consequences
- Easier: billing (and any future role-gated feature) resolves the caller's role
  from the session round-trip it already makes, instead of caching
  `UserRoleChanged` or maintaining a separate allowlist.
- Unchanged: stored enum, migration state, and the `UserRoleChanged` contract.

## Amendment 2026-06-30: identity is the authorization authority (owns capabilities)

### Context
Subscriptions (ADR-0078) introduce *what features a user has*. Rather than let
billing own a feature catalogue, or each consumer merge role + subscription,
identity — already the authz hub (auth + roles) — becomes the single place that
answers *"what can this user do."*

### Decision
- **identity owns capabilities** alongside roles. It **consumes
  `SubscriptionChanged`** from billing (ADR-0078 amendment) — a NATS event,
  contract-coupling only — and derives a per-user **capability set** from
  `(role + subscription)`. This is identity acting as the authorization
  decision-point: aggregating facts to produce permissions. Consuming a
  subscription signal is identity *doing its job*, not a layering inversion.
- **`whoami` and `/v1/users/me` gain a `capabilities` array.** identity also
  emits a capability-change event for backend consumers (grid/game), mirroring
  the `UserRoleChanged` posture. Consumers gate on **capabilities + `userId`
  only** — they never learn billing or subscriptions exist.
- **Capability sources:** *role-derived* (e.g. maintainer → `billing:subscribe`,
  available now from role alone) and *subscription-derived* (tier → feature
  capabilities, deferred with the offer — currently empty). The test-phase
  `billing:subscribe` capability is role-derived, so it needs no subscription
  data.
- billing checks the `billing:subscribe` capability for its own endpoint access
  (ADR-0078 amendment, option (a)); it remains capability-blind otherwise.

### Threat model (delta)
- identity now consumes a billing event; payload carries no secrets, internal
  subject. A user reading their own capabilities is low-risk (their own
  attribute). Server-side enforcement stays in each consumer; capabilities are
  an input, never the enforcement itself.

### Consequences
- Single authorization authority: one source (identity) answers role +
  capabilities; billing stays pure; consumers have one authz dependency.
- identity grows to own product authz *policy* (the tier→capability mapping). If
  that ever gets complex, the escape hatch is a dedicated `entitlements` context
  depending on billing + identity — but identity is the right pragmatic home now.
