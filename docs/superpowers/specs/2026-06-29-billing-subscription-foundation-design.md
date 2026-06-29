# Subscription billing — technical foundation (design)

> Status: draft for review · 2026-06-29 · scope: **technical foundation only**
> (no pricing, no committed free/paid boundary — see Non-goals).

## Context

WordSparrow has declared commercial intent (ADR-0058) but has no payment
infrastructure of any kind. This spec designs the **entitlements + billing
foundation** so a subscription can be switched on later, under real demand,
without re-architecting. It deliberately does **not** decide what is free vs
paid, the price, or the tiers — that is a product/strategy decision the
maintainer will make later against real usage. The heavy, hard-to-change
plumbing is built now; the gating policy is config layered on top.

The maintainer operates WordSparrow through a **French EURL with accounting**,
which makes the EURL the legal merchant and removes the main reason to use a
Merchant-of-Record provider (see Provider posture).

## Goals

- A new `billing` bounded context that owns subscription lifecycle and exposes
  a **gate-agnostic entitlement primitive** ("does user X have capability Y?").
- Entitlement state propagated to enforcers (`grid`/`game`) and to the frontend
  with **server-side enforcement** as the source of truth.
- A provider integration isolated behind an **anti-corruption port** so the
  concrete PSP is swappable and additional billing sources (Google Play, Apple)
  can be added later without touching the domain.
- A **resilient deletion-cancellation guarantee**: a user can never be deleted
  while an active subscription keeps billing them.
- Zero card data on our side (PCI **SAQ A**), minimal PII at rest.

## Non-goals

- No pricing, tier catalogue, or free/paid boundary. The foundation ships a
  capability interface and a *candidate* gate list, nothing committed.
- No actual feature gates wired into product surfaces beyond the enforcement
  primitive (those land when the offer is decided).
- No Google Play / Apple adapters built now — the model is multi-source so they
  slot in later; only one PSP adapter is implemented first.
- No refund/proration policy decisions (flagged as later product choices).

## Constraints (locked with the maintainer)

1. **EU digital sovereignty.** Prefer an EU-owned provider with EU data
   residency, consistent with the deliberate Hetzner choice (ADR-0009). Stripe
   is excluded on sovereignty grounds (US-HQ) despite best-in-class DX.
2. **Never handle sensitive data.** Hosted/redirect checkout only — card data is
   entered on the provider surface; we receive tokens/refs. No card fields in
   our DOM, ever. PCI scope = SAQ A.
3. **Stores likely later.** Entitlement is decoupled from billing *source* from
   day one (source-tagged), so Play/Apple adapters can be added without retrofit.
4. **EURL + accounting.** We are the merchant; the accountant files VAT/OSS.
   Direct PSP, not Merchant-of-Record.

## Architecture

A new **`billing`** bounded context, hexagonal like the others
(`domain/ application/ infrastructure/ api/`). Adding a bounded context is
approved by the maintainer and will be ratified by an ADR (see Registry
coherence). Cross-context imports remain forbidden — `billing` communicates only
via merged schemas and domain events.

- **`domain/`** — `Subscription`, `Entitlement`, `Tier`, `BillingSource`, and the
  subscription lifecycle state machine (`active / past_due / canceled / expired`
  plus `pending_cancellation`). Pure; no vendor types.
- **`application/`** — ports: `BillingProviderPort` (create-checkout-session,
  parse-lifecycle-event, cancel-subscription), the webhook-ingestion use case,
  the deletion-cancellation use case, and the entitlement projection. All
  provider-agnostic.
- **`infrastructure/`** — the concrete provider **adapter(s)** (one PSP first;
  Play/Apple later), Postgres (via Flyway) for subscription + entitlement state,
  the NATS publisher. **Only this layer knows a provider exists**; provider
  webhook shapes never leak past it (anti-corruption boundary).
- **`api/`** — three edges: an **authed** `POST /checkout-session`; a **public,
  authenticated** `/webhook` (signature-verified, or re-fetch-by-id where the
  provider offers no signature); and a small entitlement read endpoint.

### Cross-context rules

- `billing` **cannot import `identity`**. It references a user only by `userId`
  (from the authed session) and reacts to identity's events.
- `billing` publishes **`EntitlementChanged`** over NATS, modelled on
  `UserRoleChanged` (ADR-0060). `grid`/`game`/`identity` consume and cache it.
- `billing` consumes **`user.deleted`** to cancel + erase (see Deletion-
  cancellation invariant) — but on a **stronger delivery contract** than
  `EntitlementChanged` (see below).

### Flow

```
subscribe → POST /checkout-session (authed) → BillingProviderPort.createCheckout()
          → redirect to provider-HOSTED page → user pays (card never touches us)
provider  → /webhook (signature-verified, idempotent) → update Subscription+Entitlement
          → publish EntitlementChanged
grid/game ← consume EntitlementChanged → cache → enforce gates SERVER-SIDE
frontend  ← read tier (identity /me) → render UI (cosmetic only; never source of truth)
reconcile  CronJob re-syncs from provider (missed webhooks; Play 3-day ack later)
```

## Entitlement model & propagation

**Model — tier enum + capability mapping.** The stored truth is a `tier` enum
(`free`/`premium`/…); the queried interface is **capabilities**. Consumers ask
*"does user X have capability Y?"* and never see tiers. This keeps state simple
(adding a tier is a mapping change, not a schema migration) while making
consumers gate-agnostic. A future evolution to per-user stored capability sets
(comps, A/B grants) remains open without breaking the interface.

**Propagation — event-driven cache.** `billing` publishes `EntitlementChanged`;
`grid`/`game`/`identity` each keep a local projection and enforce/read from it.
This matches the existing `UserRoleChanged` machinery (ADR-0060) over the NATS
posture (ADR-0049): fast (no per-request hop) and resilient (a billing outage
does not break gated requests). Trade-off: eventual consistency. Granting premium
slightly late is harmless; revoking slightly late lets a canceled user keep
access briefly, bounded by the reconciliation job — identical to how role
revocation already behaves, and acceptable.

**Frontend read path.** Fold `tier` into identity's existing `/me` payload
(`{ user, role, tier }`); identity becomes another `EntitlementChanged` consumer.
The frontend's session bootstrap stays one call, and tier is cosmetic — the
server always enforces.

## Provider posture

Direct EU-sovereign PSP with **hosted checkout** (not Merchant-of-Record: the
EURL is the merchant and the accountant files VAT). Below the **€10k/yr EU
cross-border digital-sales threshold**, charge French VAT (20%) and declare via
existing French returns; adopt the EU **OSS** scheme + provider tax automation
only when revenue crosses the threshold. *Confirm specifics with the accountant —
not tax advice.*

### Concrete adapter recommendation: Mollie (initial)

The architecture above is provider-agnostic; this subsection only fixes the
*initial* concrete adapter implemented in the infra layer. A vetted comparison
(Mollie / Lyra-PayZen / PayPlug / Stancer, with Stripe excluded on sovereignty
and Adyen/Worldline on fit) recommends **Mollie (Amsterdam; DNB-regulated EMI)**
as the initial adapter. It is the only candidate combining all of:

- a **first-class Subscriptions API** (mandate-based recurring);
- **SEPA Direct Debit** *and* card recurring (DD avoids card-expiry churn and
  suits a French audience);
- automatic **SCA / 3DS2**;
- **SAQ-A** hosted checkout (redirect Checkout / Payment Links / hosted
  Components — no card fields in our DOM);
- an **official Java SDK** usable directly from the Kotlin/Ktor backend;
- **signed webhooks** (next-gen `X-Mollie-Signature`, HMAC-SHA256);
- **no monthly/setup fee** (≈1.80% + €0.25 EU consumer cards; SEPA DD ≈€0.35),
  with self-serve French onboarding and no minimum volume.

**Mollie-specific design notes** the adapter must honour:
- **Webhook auth:** use Mollie's **next-gen HMAC-signed** webhooks
  (`X-Mollie-Signature`). The *classic* webhook carries **no signature** — if
  used, authenticate by **re-fetching the resource by id** over the API rather
  than trusting the payload. The adapter must verify-or-refetch; never trust an
  unauthenticated body.
- **No native trials/proration/metering:** the Subscriptions API is
  fixed-interval / constant-amount. For a flat monthly/annual tier this is
  sufficient (trials/proration are YAGNI now); if ever needed, model them in our
  own `domain/`, not the provider.
- **Build our own customer portal** (cancel / update payment method / view
  invoices via the Mollie API) — no provider-hosted self-serve portal exists.
  This is budgeted frontend + API work, consistent with the data posture.

**Fallback:** **Lyra / Systempay / PayZen** (Toulouse; French-owned) is the
documented fallback if a hard *"data physically in France"* guarantee proves
non-negotiable and Mollie cannot provide it in writing. Trade-offs: strongest
technical primitive (RRULE schedules, HMAC-signed IPN, SAQ-A embedded form) but
**bank-gated onboarding** (a separate VAD/VADS acquiring contract is required
before go-live), a monthly gateway fee plus separately-negotiated bank acquiring
%, and no official JVM SDK. Heaviest setup for a solo operator.

**Must verify before locking the provider (do not assume):**
- **EU data residency** for Mollie is **UNVERIFIED** from public pages — obtain
  the **DPA / data-residency terms in writing**. Mollie is Dutch/DNB-regulated
  (sovereignty far stronger than US-HQ'd Stripe), but residency must be on paper.
- **Re-fetch current fees** at build time (pricing pages drift).
- **Confirm the Java SDK is current** and covers the Subscriptions + webhook
  surfaces we need (else fall back to the REST API directly).
- The anti-corruption port means none of these caveats reach the domain — they
  are confined to the Mollie adapter in `infrastructure/`.

## Checkout, webhook ingestion, reconciliation

- **Checkout (authed).** `POST /checkout-session {tier}` → look up/create the
  provider customer keyed to `userId` (store the mapping) → `createCheckout()` →
  return the **hosted** redirect URL + success/cancel URLs. `userId` comes from
  the **session, never the request body**.
- **Webhook (public, hardened).** `POST /webhook` → (1) **authenticate the
  callback** — verify the provider signature where one exists, else **re-fetch
  the resource by id** over the API; never trust an unauthenticated body;
  (2) **dedupe** by provider event id
  (idempotency table); (3) adapter parses payload → domain lifecycle event;
  (4) apply to `Subscription`, recompute `Entitlement`; (5) publish
  `EntitlementChanged`; (6) return 2xx fast (providers retry on non-2xx).
  Out-of-order/duplicate events are applied only if the provider's state
  version/timestamp is newer.
- **Reconciliation.** A k8s **CronJob** (ADR-0042 pattern) re-syncs active
  subscriptions from the provider — catches missed webhooks and (later) handles
  Play's acknowledge-within-3-days rule. Provider is source-of-truth; our
  `Subscription` is a cached projection; `Entitlement` is derived.

## Deletion-cancellation invariant (first-class)

**A user must never be deleted while an active subscription keeps billing them.**
This flow gets stronger guarantees than any other in the system.

Dangerous failure modes this defends against:
1. The deletion event is **lost** → billing never cancels → ghost user charged.
2. Cancel call **fails** after we deleted our local record → `externalRef` gone
   → unrecoverable orphan subscription.

Design:

1. **Never lose the ref (linchpin).** On `user.deleted`, the local subscription
   moves to **`pending_cancellation`** — it is *not* deleted. The `externalRef`
   is retained because we still need it to cancel. Local deletion happens **only
   after** provider cancellation is durably confirmed. Ordering invariant:
   **confirm-cancel → then erase local.**
2. **Durable at-least-once delivery.** `user.deleted` runs through a **JetStream
   durable consumer**; billing **acks only after** cancellation is confirmed. A
   failed cancel → no ack → redelivery with backoff. This is a deliberate,
   documented exception to ADR-0060's best-effort posture.
3. **Idempotent cancel.** Canceling an already-canceled subscription is a no-op;
   retries and double-delivery are always safe.
4. **Event-independent reconciliation backstop (the hard guarantee).** The
   reconciliation CronJob lists **active subscriptions at the provider** and
   cancels any with no live entitlement intent (flagged deleted /
   `pending_cancellation`). Because it works off the provider's own state, it
   catches a `user.deleted` that was **never delivered at all**. Invariant: *an
   active subscription at the provider with no live user behind it gets canceled,
   regardless of whether any message arrived.*
5. **Alert on aging.** A `pending_cancellation` older than a threshold (e.g. 24h)
   fires a symptom alert (ADR-0032) so a human sees "a deleted user may still be
   billable" instead of a silent failure.

Consequences:
- Cancellation needs only the `externalRef`, which billing holds — so even if
  identity has already erased all PII, billing can still cancel. The financial
  guarantee does not depend on identity data surviving.
- The transient retention of `userId`/`externalRef` in the tombstone is
  GDPR-legitimate (necessary to fulfil a legal/contractual obligation) and is
  cleared once cancel confirms.

**To verify (not assume):** whether identity's current `user.deleted` is already
durable (JetStream) or fire-and-forget. If fire-and-forget, either make it
durable (prereq in identity) or rely on the backstop (4) as the guarantee — the
backstop is designed to hold *even if the event contract is weak*.

## Data, PII & retention posture

- We persist only **entitlement state + opaque provider references**
  (`userId, tier, status, periodEnd, source, externalRef`). The **provider is
  system-of-record for all PII, payment data, and invoices** — the same
  opaque-blob philosophy as cross-device progress sync (ADR-0075).
- Hosted checkout keeps us at PCI **SAQ A** — no card data, ever.
- **Statutory retention lives at the provider layer, not our DB.** GDPR erasure
  is not absolute (Art. 17(3)(b) yields to legal retention obligations). A French
  EURL must retain accounting records/invoices ~**10 years** (Code de commerce
  L123-22), tax records ~**6 years** (LPF L102 B), and OSS records **10 years**
  if/when on OSS. Because the provider holds the invoices/financial records (and
  the accountant exports them), **our entitlement projection is safe to delete on
  erasure** — it is not the accounting source document. *Confirm with the
  accountant that the provider's invoice retention (or accounting export)
  satisfies the Code de commerce obligation.*
- Optional (flagged, not baked in): a short soft-delete grace window on our side
  for chargeback/dispute handling — operational, not legal.

## Schema-first contracts (ADR-0003)

- **`billing/api/openapi.yaml`** for the HTTP edges (checkout-session, webhook,
  entitlement read) — **schema-only PR first** (`openapi-lint` gate), then the
  frontend regenerates types via `pnpm api:check` (`openapi-typescript-drift`
  gate).
- **`billing/api/asyncapi.yaml`** for **`EntitlementChanged`** (mirrors game's
  AsyncAPI, ADR-0019) on an internal, NetworkPolicy-guarded subject (e.g.
  `wordsparrow.user.entitlement-changed`), payload
  `{ userId, tier, status, periodEnd, source, changedAt }`.
- Provider webhook payloads are **not** in our schema — they are the provider's
  shape, translated by the adapter. Only our edges are contracted.

## Testing strategy

- **TDD, near-100% mutation** on domain: `Subscription` state machine,
  `Entitlement` derivation, tier→capability mapping, the
  pending-cancellation transitions.
- **Property-based** on webhook parsing / idempotency / ordering.
- **Mock only at the boundary:** in-memory `BillingProviderPort` fake for
  application tests; real Postgres testcontainer for infra; never mock our own
  classes. Replay / forged-signature tests on the webhook.
- **Konsist arch tests:** no vendor SDK in `domain/`/`application/`; no
  cross-context import of `identity`.
- Contract drift gates (OpenAPI/AsyncAPI) green.

## Rollout, secrets, threat model

- **Dark launch behind a feature flag** (deploy dark, release bright; flag
  carries an expiry). Checkout entry hidden until flipped.
- **Secrets:** provider API key + webhook signing secret as **k8s Secrets**
  (added to `docs/secrets.md` inventory); never in code; injected at runtime.
- **Threat model (required — auth + payments).** Assets: entitlement (confers
  paid capability), provider API key, webhook authenticity. Defenses:
  authenticate the webhook (verify signature, or re-fetch by id where the
  provider offers none — never trust an unauthenticated body → blocks **forged
  entitlement grants**); authed checkout with session-derived `userId` (no
  IDOR/spoof);
  internal NATS subject + NetworkPolicy; `user.deleted` → cancel + erase (above);
  no card data (SAQ A); replay protection via idempotency + signature timestamp.
- **Configure-in-cluster** posture for any provider/stream bootstrap (Helm
  post-install/upgrade Job), never push-from-CI.

## Registry coherence

In the relevant PRs: the **ADR** ratifying the new `billing` context +
entitlement architecture + threat model + deletion invariant; the
bounded-contexts table in `CLAUDE.md`; and `docs/adr/INDEX.md`. CI's
`registry-coherence` gate enforces ADR↔INDEX and new-module↔CLAUDE.md.

## PR wave decomposition (detailed in the implementation plan)

1. **W1 — governance:** ADR (new context + entitlement arch + threat model +
   deletion invariant) + this spec + registry updates (`INDEX.md`, CLAUDE.md
   table).
2. **W2 — schema-only:** `billing/api/openapi.yaml` + `asyncapi.yaml`
   (`openapi-lint`, drift gates).
3. **W3 — domain + application:** `Subscription`, `Entitlement`,
   tier→capability, ports, deletion-cancellation use case (TDD; no infra).
4. **W4 — infrastructure:** Postgres/Flyway, NATS publisher, the PSP adapter,
   webhook verify + idempotency, checkout-session.
5. **W5 — consumers:** `grid`/`game`/`identity` `EntitlementChanged`
   projections + server-side gate primitive + `/me` tier.
6. **W6 — reconciliation + rollout:** reconciliation CronJob + Helm chart +
   secrets + dark-launch flag + flagged-off frontend checkout entry +
   deletion-cancellation backstop wiring + aging alert.

Each wave is reviewed and merged before the next starts (later waves may be
reshaped by what earlier ones reveal).

## Open questions / to confirm

- **Mollie EU data-residency / DPA in writing** — recommended provider is
  resolved (Mollie), but its physical data residency is UNVERIFIED from public
  pages; obtain the DPA/residency terms before the sovereignty claim is locked.
  Lyra/PayZen is the documented fallback if a hard "data in France" guarantee is
  required.
- **Accountant confirmation** that the provider's invoice retention (or
  accounting export) satisfies the Code de commerce 10-year obligation.
- **identity `user.deleted` durability** — JetStream-durable or fire-and-forget?
  Determines whether the durable-consumer path is a prereq or the backstop alone
  carries the guarantee.
- **Optional choices, not baked in:** soft-delete grace window; refund/proration
  policy on cancellation.
