# ADR-0078: Billing bounded context + subscription entitlement foundation

## Status
Accepted

## Context
WordSparrow has declared commercial intent (ADR-0058) but has no payment
infrastructure. We need a foundation that lets a subscription be switched on
later, under real demand, without re-architecting — while deliberately deferring
the product offer (what is free vs paid, price, tiers). The heavy, hard-to-change
plumbing is decided now; the gating policy is config layered on top.

Two facts shape the decision. The maintainer operates WordSparrow through a
**French EURL with accounting**, so the EURL is the legal merchant and the
accountant files VAT/OSS — removing the main reason to use a Merchant-of-Record
provider. And the project deliberately runs on EU-sovereign infrastructure
(Hetzner, ADR-0009), so the payment provider should match that posture.

Subscriptions also imply a hard correctness requirement: a user must never be
deleted while an active subscription keeps billing them.

## Decision
Add a new **`billing`** bounded context, hexagonal like the others
(`domain/ application/ infrastructure/ api/` + a reconciliation worker). It
communicates with other contexts only via merged schemas and NATS domain events;
cross-context imports remain forbidden (Konsist-enforced).

- **Provider behind an anti-corruption port.** `application/` defines a
  provider-agnostic `BillingProviderPort`; only `infrastructure/` knows a
  provider exists, and provider payload shapes never leak past it. The **initial
  adapter is Mollie** (Amsterdam, DNB-regulated EMI): the only EU-sovereign
  candidate combining a first-class Subscriptions API, SEPA Direct Debit + card
  recurring, automatic SCA/3DS2, SAQ-A hosted checkout, an official Java SDK, and
  signed webhooks, with no monthly fee. Lyra/PayZen is the documented fallback if
  a hard "data physically in France" guarantee proves non-negotiable.
- **Multi-source entitlement.** Entitlement is source-tagged from day one
  (`source` ∈ Mollie / Play / Apple …) so Google Play and Apple App Store billing
  adapters slot in later without retrofit. Only the one PSP adapter is built now.
- **Tier-enum + capability mapping.** Stored truth is a `tier` enum; the queried
  interface is **capabilities** ("does user X have capability Y?"). Consumers are
  gate-agnostic; adding a tier is a mapping change, not a schema migration. This
  keeps the foundation usable before the free/paid boundary is chosen.
- **Event-driven propagation, server-side enforcement.** `billing` publishes
  `EntitlementChanged` on `wordsparrow.user.entitlement-changed`, modelled on
  `UserRoleChanged` (ADR-0060) over the NATS posture (ADR-0049). `grid`/`game`/
  `identity` consume and cache it; gates are enforced **server-side**, and the
  frontend reads `tier` from `/me` for cosmetic UI only.
- **No card data (PCI SAQ A).** Hosted/redirect checkout only; we persist only
  entitlement state + opaque provider references; the provider is system-of-record
  for PII, payment data, and invoices (same posture as ADR-0075's opaque blob).

### Deletion-cancellation invariant (first-class)
`user.deleted` handling gets stronger guarantees than any other flow, and is a
**deliberate exception to ADR-0060's best-effort delivery** for that subject:
1. **Never lose the ref.** On `user.deleted`, the subscription moves to
   `pending_cancellation` (not deleted); the `externalRef` is retained. Local
   deletion happens only after provider cancellation is durably confirmed.
2. **Durable at-least-once delivery** via a JetStream durable consumer; ack only
   after cancellation confirms (failed cancel → redelivery with backoff).
3. **Idempotent cancel** (canceling an already-canceled subscription is a no-op).
4. **Event-independent reconciliation backstop** — the reconciliation CronJob
   lists provider-active subscriptions and cancels any with no live entitlement
   intent, catching a `user.deleted` that was never delivered at all. This is the
   hard guarantee; it holds even if the event contract is weak.
5. **Aging alert** — a `pending_cancellation` older than a threshold fires a
   symptom alert (ADR-0032).

Cancellation needs only the `externalRef` (held by `billing`), so it succeeds even
after identity has erased all PII.

### Threat model (auth + payments)
- **Assets:** entitlement (confers paid capability), provider API key, webhook
  authenticity.
- **Webhook:** public endpoint; **authenticate every callback** — verify the
  provider signature where one exists, else re-fetch the resource by id; never
  trust an unauthenticated body (blocks forged entitlement grants). Replay
  protection via idempotency table + signature timestamp.
- **Checkout:** authed; `userId` is session-derived, never from the request body
  (no subscribe-as-another-user / IDOR).
- **Event exposure:** internal NATS subject, NetworkPolicy-guarded; payload
  carries no secrets.
- **Secrets:** provider API key + webhook signing secret as k8s Secrets, injected
  at runtime, never in code.

### Retention
GDPR erasure is not absolute (Art. 17(3)(b) yields to legal retention). Statutory
retention (Code de commerce ~10y, LPF ~6y, EU OSS 10y) is satisfied by the
**provider's** invoice records (plus accounting export), not our DB — so our
entitlement projection is safe to delete on erasure. Confirm with the accountant
that provider retention satisfies the Code de commerce obligation.

### Rollout phasing (maintainer-gated test phase → promotion)
The foundation ships dark and is validated end-to-end before any real customer
or real money is involved:

- **Test phase (default).** The adapter runs against the provider's **test
  mode** (Mollie test API key `test_…`; no real charges). Access to the
  subscription flow — the checkout and cancel endpoints and the frontend entry —
  is **gated to an explicit maintainer user-id allowlist** (config:
  `BILLING_ALLOWED_USER_IDS`, mirroring ADR-0060's `MAINTAINER_USER_IDS`
  posture; non-allowlisted callers get `403`). This is a tightening of the
  dark-launch flag, not a new authz surface: it restricts who can reach an
  already-flag-gated feature. The allowlist could equivalently key off the
  ADR-0060 `maintainer` role; the user-id allowlist is chosen for the test phase
  because it is the most explicit and needs no role propagation into `billing`.
- **Promotion (deliberate, reversible).** Going GA is two flips, each
  independently reversible: (1) swap the provider key from `test_…` to the live
  key (k8s Secret), and (2) lift the allowlist gate so all authenticated users
  can subscribe. Both are flag/secret changes, not code changes.

The maintainer-gate threat posture is trivial: it can only *deny* access; the
risk is in the *promotion* (loosening), which is a conscious operator action.

## Consequences
- **Easier:** one reusable, gate-agnostic entitlement primitive; a swappable
  provider; Play/Apple billing sources slot in without rework; the offer can be
  decided later as config.
- **Harder:** a new cross-context contract (`EntitlementChanged`) to maintain; a
  new external integration to operate (webhooks, reconciliation, dunning); a
  customer self-serve portal must be built (Mollie offers none).
- **Deferred:** pricing and the free/paid boundary; Play/Apple adapters; trials/
  proration (modelled in `domain/` if ever needed, not the provider). Two facts
  must be confirmed before the relevant waves: Mollie's Java SDK currency (W4
  adapter: SDK vs REST) and identity's `user.deleted` durability (W6: prereq
  change vs backstop-only) — and Mollie's EU data-residency must be obtained in
  writing before the sovereignty claim is locked.

## Amendment 2026-06-30: capabilities move to identity; billing emits subscription state

### Context
The original decision had `billing` own the tier→capability mapping and emit
`EntitlementChanged` carrying capabilities. That couples the payment context to
the product feature catalogue (every offer change touches billing) and forces
each consumer to merge two authz sources (identity roles + billing capabilities).

### Decision
A clean separation of concerns, with **identity as the single authorization
authority**:

- **billing knows only `userId` and subscriptions — never capabilities.** It
  emits **`SubscriptionChanged(userId, tier, status)`** (renamed from
  `EntitlementChanged`; no capabilities on the wire) on
  `wordsparrow.user.subscription-changed`. `GET /v1/entitlement` becomes
  **`GET /v1/subscription`** (the caller's own subscription status, for the
  manage-subscription UI). `Capability` and `capabilitiesFor` are **removed**
  from `billing/domain`.
- **identity owns capabilities** (see ADR-0060 amendment): it consumes
  `SubscriptionChanged`, maps `(role + subscription) → capabilities`, and exposes
  them. `billing` does not consume capabilities to *own* them.
- **The test-phase access gate becomes the `billing:subscribe` capability**
  (option (a)), replacing the `BILLING_ALLOWED_USER_IDS` allowlist / maintainer-
  role gate from the 2026-06-29 amendment. identity grants `billing:subscribe`
  to the maintainer during the test phase. billing's checkout/cancel endpoints
  **check that one permission for endpoint access** (read from the session/
  whoami) — billing *checks* a permission like any protected endpoint, it does
  not *own* or derive capability logic. Promotion lifts the gate by identity
  granting `billing:subscribe` more broadly (no billing code change).

### Consequences
- billing stays a pure money/subscription context; the offer/feature catalogue
  never touches it. Consumers (grid/game/frontend) gate on capabilities from
  identity alone and never learn billing exists.
- Supersedes the parts of the 2026-06-29 amendment that put the gate in billing
  as a user-id allowlist / role check, and the original "billing owns the
  tier→capability mapping / emits capabilities" decision. The deletion-
  cancellation invariant, hosted-checkout/SAQ-A posture, retention, and
  multi-source design are unchanged.
