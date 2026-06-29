# Subscription Billing Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Bliss-native execution:** This repo executes multi-PR rollouts via the
> `dispatch` skill under the PR-wave discipline (each wave reviewed + merged
> before the next; later waves may be reshaped by review). The terminal artifact
> of each wave is a merged PR that passes all CI gates and §6a review.

**Goal:** Build the gate-agnostic entitlements + billing technical foundation for
WordSparrow subscriptions — a new `billing` bounded context, a Mollie adapter
behind an anti-corruption port, event-driven entitlement propagation, and a
resilient deletion-cancellation guarantee — without deciding the free/paid offer.

**Architecture:** New hexagonal bounded context `billing/`
(`domain/ application/ infrastructure/ api/` + a reconciliation worker). The
domain owns the subscription lifecycle and a tier→capability entitlement model;
the application defines a provider-agnostic `BillingProviderPort`; infrastructure
implements the Mollie adapter, Postgres/Flyway persistence, and NATS publishing.
Entitlement state flows to `grid`/`game`/`identity` via an `EntitlementChanged`
JetStream event (consumers cache and enforce server-side). A reconciliation
CronJob is the event-independent backstop for the deletion-cancellation
invariant.

**Tech Stack:** Kotlin 2.3.21 + Ktor on JDK 21; Postgres via CNPG + Flyway; NATS
JetStream (ADR-0049); Mollie (official Java SDK or REST); Helm on k3s (ADR-0009);
Vite/React/TS frontend (types generated from OpenAPI).

**Source spec:** `docs/superpowers/specs/2026-06-29-billing-subscription-foundation-design.md`

## Global Constraints

Every task implicitly includes these (copied from CLAUDE.md / the spec):

- **PR cap:** 400 lines of diff (excl. generated + blank), one workstream per PR.
  Cap-override is authorized with written justification (standing grant).
- **Commits:** conventional, bounded-context scope, **DCO sign-off (`-s`)**.
  Types: `feat fix chore refactor test docs`. No `--no-verify`, no `--no-gpg-sign`.
- **Branches:** `<type>/<short-description>`, type ∈ the set above.
- **ADR before non-trivial change; the ADR merges first** (ADR-0001 §7).
- **Schema-first** (ADR-0003): a schema-only PR merges before producer/consumer
  PRs. Never hand-edit generated types.
- **Hexagonal:** `domain/` depends on nothing; no vendor SDK import in `domain/`
  or `application/`; **no cross-context imports** — communicate via merged
  schemas or NATS domain events. Enforced by Konsist (`*ArchitectureTest.kt`).
- **TDD for domain logic**, near-100% mutation coverage; **property-based** tests
  for serialization/parsing/validation; **mock only at external boundaries**
  (never mock our own classes — use the real instance or an in-memory fake).
- **Comments:** one line, non-obvious WHY only; no multi-line comment blocks.
- **Secrets never in code**; injected at runtime as k8s Secrets.
- **Observability:** structured JSON logs, correlation IDs; no `println` /
  `console.log`; no string concatenation in log messages.
- **French copy uses tutoiement** ("tu", never "vous") — applies to any
  user-facing checkout/subscription copy.
- **No card data, ever** (PCI SAQ A): hosted/redirect checkout only.

---

## File Structure (whole foundation)

Locks in decomposition. Created across the waves below.

**Governance (W1)**
- `docs/adr/0078-billing-subscription-context.md` — ratifies the new context,
  entitlement architecture, deletion invariant, threat model.
- `docs/adr/INDEX.md` — add `billing/**` → ADR-0078 path mapping.
- `docs/superpowers/specs/2026-06-29-…-design.md` — the spec (already committed).
- `docs/superpowers/plans/2026-06-29-…-foundation.md` — this plan.

**Schema (W2)**
- `billing/api/openapi.yaml` — `POST /checkout-session`, `POST /webhook`,
  `GET /entitlement` edges.
- `billing/api/asyncapi.yaml` — `EntitlementChanged` on
  `wordsparrow.user.entitlement-changed`.
- `frontend/src/infrastructure/api/billing/types.ts` — generated (drift gate).

**Module scaffold + domain (W3)**
- `settings.gradle.kts` — `include(":billing:domain" … ":billing:api")`.
- `CLAUDE.md` — add `billing` row to the bounded-contexts table.
- `billing/domain/` — `Subscription`, `SubscriptionStatus`, `Entitlement`,
  `Tier`, `Capability`, `BillingSource`, tier→capability mapping.
- `billing/application/` — `BillingProviderPort`, `SubscriptionRepository`,
  `EntitlementPublisher` (ports); `IngestProviderEvent`, `HandleUserDeleted`,
  `EntitlementQuery` (use cases).

**Infrastructure (W4)**
- `billing/infrastructure/` — `MollieBillingAdapter`, `PostgresSubscriptionRepository`,
  Flyway `V1__billing.sql`, `NatsEntitlementPublisher`, `JetStreamUserDeletedConsumer`.
- `billing/api/` — Ktor routes for the three edges + DI wiring.

**Consumers (W5)**
- `grid/application` + `grid/infrastructure` — `EntitlementChanged` consumer +
  cache table + a `requireCapability` enforcement primitive.
- `game/…` — same consumer + cache (only if a gated game surface is anticipated;
  else defer).
- `identity/…` — consume `EntitlementChanged`; add `tier` to the `/me` payload.

**Reconciliation + rollout (W6)**
- `billing/worker/` — `ReconcileSubscriptions` job (backstop + missed-webhook
  resync + aging-alert emit).
- `infra/platform/charts/billing/` — Deployment, CronJob, Service, NetworkPolicy,
  Secret refs; `docs/secrets.md` inventory entry.
- `frontend/` — checkout entry behind a feature flag (flagged off).

---

## WAVE 1 — Governance (ADR + registry)

**Branch:** `docs/billing-subscription-foundation` (current; spec already on it).
**PR scope:** spec + this plan + ADR-0078 + INDEX.md. Docs-only; invoke the
cap-override (justification: single docs/governance workstream, no code).
**Why first:** ADR-0001 §7 — the ADR ratifying a new bounded context must merge
before any implementation.

### Task 1.1: Write ADR-0078

**Files:**
- Create: `docs/adr/0078-billing-subscription-context.md`

**Interfaces:**
- Produces: the canonical decision record every later wave cites in its
  `scripts/adr-context.sh` pre-read.

- [ ] **Step 1: Write the ADR** using the repo template (Status/Context/Decision/
  Consequences). Content, drawn verbatim from the spec, must state:
  - **Status:** Accepted.
  - **Context:** commercial intent (ADR-0058), no payment infra, need a
    gate-agnostic foundation; EURL-is-merchant ⇒ direct PSP not MoR; EU
    sovereignty (consistent with ADR-0009 Hetzner); stores likely later.
  - **Decision:** new `billing` bounded context (hexagonal); anti-corruption
    `BillingProviderPort` with **Mollie** as the initial adapter; **multi-source**
    entitlement (source-tagged) for later Play/Apple; **tier-enum + capability
    mapping** entitlement model; **event-driven `EntitlementChanged`** propagation
    (mirrors `UserRoleChanged`, ADR-0060; NATS posture ADR-0049) with
    **server-side enforcement**; **no card data (SAQ A)**, opaque refs only,
    provider is system-of-record for PII/invoices.
  - **Deletion-cancellation invariant** (first-class): never lose the
    `externalRef` → `pending_cancellation` → durable JetStream consumer →
    idempotent cancel → event-independent reconciliation backstop → aging alert.
    Document this as a **deliberate exception** to ADR-0060's best-effort
    delivery for the `user.deleted` subject.
  - **Threat model** (required — auth + payments): assets (entitlement, provider
    API key, webhook authenticity); defenses (authenticate webhook
    [signature or re-fetch-by-id], session-derived `userId` on checkout, internal
    NetworkPolicy-guarded NATS subject, `user.deleted`→cancel+erase, replay
    protection via idempotency + signature timestamp).
  - **Retention:** statutory retention lives at the provider (Code de commerce
    ~10y, LPF ~6y, OSS 10y); our projection is erasable (GDPR Art. 17(3)(b)).
  - **Consequences:** easier (one reusable entitlement gate; swappable provider;
    stores slot in); harder (a new cross-context contract `EntitlementChanged`;
    a new external integration to operate); deferred (pricing/offer, Play/Apple
    adapters, customer-portal polish).

- [ ] **Step 2: Verify** the ADR renders and the threat model + invariant are
  present. Run: `grep -c "Deletion-cancellation\|Threat model" docs/adr/0078-billing-subscription-context.md`
  Expected: ≥ 2.

### Task 1.2: Update the ADR registry

**Files:**
- Modify: `docs/adr/INDEX.md`

- [ ] **Step 1:** Add the path→ADR mapping so `scripts/adr-context.sh` resolves
  it. Add entries mapping `billing/**`, `billing/api/**`, and
  `infra/platform/charts/billing/**` to ADR-0078 (follow the existing INDEX.md
  row format exactly).
- [ ] **Step 2: Verify** the helper resolves. Run:
  `scripts/adr-context.sh billing/domain/Subscription.kt | grep -c 0078`
  Expected: ≥ 1.

### Task 1.3: Open the Wave-1 PR

- [ ] **Step 1: Commit** (sign-off):
  `git add docs/adr/0078-billing-subscription-context.md docs/adr/INDEX.md docs/superpowers/plans/2026-06-29-billing-subscription-foundation.md`
  `git commit -s -m "docs(billing): ADR-0078 new billing bounded context + foundation plan"`
- [ ] **Step 2: Push + open PR** titled
  `docs(billing): ADR-0078 subscription billing foundation (spec + plan)`.
  Body names the workstream (governance wave), the bounded context (`billing`),
  the schemas to ship first (W2), and **invokes the cap-override** (docs-only,
  one workstream). Do **not** put follow-up scope promises in the body
  (the §6a fixer acts on them).
- [ ] **Step 3:** Schedule the auto-merge cron (merge on green CI + §6a LGTM).
  **Gate:** `registry-coherence` (ADR↔INDEX) must be green.

> **CLAUDE.md bounded-contexts table** is intentionally NOT touched here — its row
> reflects an *existing* module; it lands in W3 when `settings.gradle.kts`
> actually registers `:billing:*` (keeps `registry-coherence` module↔table
> truthful).

---

## WAVE 2 — Schema-only (OpenAPI + AsyncAPI)

**Branch:** `feat/billing-api-schema` (off `origin/main` after W1 merges).
**PR scope:** the two YAMLs + regenerated frontend types only. CI gates:
`openapi-lint`, `openapi-typescript-drift`.
**Why a separate PR:** ADR-0003 schema-first — the contract merges before any
producer/consumer code.

### Task 2.1: Author `billing/api/openapi.yaml`

**Files:**
- Create: `billing/api/openapi.yaml`

**Interfaces (the contract later waves consume — exact shapes):**
- `POST /checkout-session` — **authed**. Request `{ tier: string }`. Response
  `201 { checkoutUrl: string, successUrl: string, cancelUrl: string }`.
  `userId` is taken from the session, **never** the body.
- `POST /webhook` — **public**. Request body is provider-opaque (a single
  `id`/resource reference field; full shape lives in the adapter, not the
  schema). Response `200` empty on accept.
- `GET /entitlement` — **authed**. Response
  `200 { tier: string, status: string, periodEnd: string|null, capabilities: string[] }`.

- [ ] **Step 1:** Write the OpenAPI 3.1 document with the three paths above,
  component schemas (`CheckoutSessionRequest`, `CheckoutSessionResponse`,
  `EntitlementView`), and security schemes matching the existing `grid`/`identity`
  session auth (copy the scheme block from `grid/api/openapi.yaml`).
- [ ] **Step 2: Lint.** Run the same command CI runs for `openapi-lint` (see
  `.github/workflows/`); Expected: PASS, zero errors.

### Task 2.2: Author `billing/api/asyncapi.yaml`

**Files:**
- Create: `billing/api/asyncapi.yaml`

**Interfaces:**
- Channel `wordsparrow.user.entitlement-changed`, message `EntitlementChanged`,
  payload `{ userId: string, tier: string, status: string, periodEnd: string|null, source: string, changedAt: string }`.

- [ ] **Step 1:** Write the AsyncAPI document modelled on
  `game/api/asyncapi.yaml` (ADR-0019) — same version, server, and message-trait
  conventions; one channel, one message, the payload above.
- [ ] **Step 2: Verify** it parses with the repo's AsyncAPI tooling (mirror the
  command game uses). Expected: PASS.

### Task 2.3: Regenerate frontend types + open PR

**Files:**
- Modify (generated): `frontend/src/infrastructure/api/billing/types.ts`

- [ ] **Step 1:** From `frontend/`, run `pnpm api:check` to generate billing
  types and confirm no drift. Expected: types written, drift check clean.
- [ ] **Step 2: Commit** (sign-off) `chore(api-billing): add billing OpenAPI +
  AsyncAPI schemas and generated types`, push, open PR, schedule auto-merge cron.
  **Gates:** `openapi-lint`, `openapi-typescript-drift` green.

---

## WAVES 3–6 — deferred to just-in-time plans

> **Why deferred (not placeholders):** (1) the repo's rule that **review may
> reshape later waves** — detailing them now risks discarded work; (2) two spec
> **open questions gate the implementation detail** and must be resolved first:
> *is Mollie's Java SDK current* (decides W4 adapter shape: SDK vs raw REST) and
> *is identity's `user.deleted` JetStream-durable* (decides whether W6 needs a
> prereq identity change or leans on the backstop). Writing line-level Kotlin for
> these now would be fiction. **Each wave below is authored into its own
> `docs/superpowers/plans/` file with full TDD step detail once its predecessor
> merges and its blocking question is answered.**

### Wave 3 — Module scaffold + domain + application (TDD, no infra)

- **Blocking question:** none (pure domain). Can start once W2 merges.
- **PR scope:** `settings.gradle.kts` registration; `CLAUDE.md` bounded-contexts
  row; `billing/domain` + `billing/application` with tests. Likely **2 PRs** to
  stay under the cap (domain, then application/ports).
- **Tasks (to expand):**
  - `Tier` enum + `Capability` enum + **tier→capability mapping** (table test
    over every tier; near-100% mutation).
  - `SubscriptionStatus` state machine incl. `pending_cancellation`; legal
    transitions + illegal-transition rejection tests.
  - `Subscription` aggregate (holds `externalRef`, `source`, `periodEnd`);
    `Entitlement` derivation from `(status, tier)`.
  - Ports: `BillingProviderPort` (`createCheckout`, `parseEvent`, `cancel`),
    `SubscriptionRepository`, `EntitlementPublisher`.
  - Use cases: `IngestProviderEvent` (idempotent apply; newer-version-wins),
    `HandleUserDeleted` (→ `pending_cancellation` → cancel → erase),
    `EntitlementQuery` (capability check). In-memory fakes for all ports.
  - Konsist `BillingArchitectureTest` (no vendor SDK in domain/application; no
    cross-context import).

### Wave 4 — Infrastructure (Mollie adapter, persistence, NATS)

- **Blocking question:** confirm Mollie Java SDK currency + coverage; else REST.
- **PR scope:** likely **3 PRs** (Flyway+repository; Mollie adapter+webhook auth;
  NATS publisher + checkout/webhook Ktor routes).
- **Tasks (to expand):** Flyway `V1__billing.sql` (subscriptions + idempotency +
  customer-map tables); `PostgresSubscriptionRepository` (testcontainer);
  `MollieBillingAdapter` (hosted checkout; **webhook auth = HMAC verify or
  re-fetch-by-id**; map Mollie events → domain events) with property-based
  parse/idempotency tests + forged-signature/replay tests; `NatsEntitlementPublisher`;
  Ktor routes with session-derived `userId`.

### Wave 5 — Consumers + enforcement + `/me`

- **Blocking question:** none. Needs W2 event contract + W4 publisher live.
- **PR scope:** likely **2–3 PRs** (one per consuming context).
- **Tasks (to expand):** `grid` `EntitlementChanged` consumer + cache table +
  `requireCapability` server-side primitive (with a test proving a gated endpoint
  rejects without the capability); same for `game` *only if* a gated surface is
  in scope; `identity` consumer + `tier` added to `/me` (drift-regenerate
  identity types).

### Wave 6 — Reconciliation backstop + rollout

- **Blocking question:** identity `user.deleted` durability (sets prereq vs
  backstop-only).
- **PR scope:** likely **3 PRs** (reconciliation worker + CronJob; Helm chart +
  Secret + NetworkPolicy; flagged-off frontend checkout entry).
- **Tasks (to expand):** `ReconcileSubscriptions` (list provider-active subs →
  cancel any with no live entitlement intent — the **event-independent
  backstop**; resync missed webhooks; **emit aging alert** for
  `pending_cancellation` > 24h via ADR-0032); Helm `billing` chart with CronJob,
  NetworkPolicy for the NATS subject, Secret refs (`docs/secrets.md` entry); the
  JetStream **durable consumer** for `user.deleted` (or the prereq identity
  change if W6's blocking question says fire-and-forget); frontend checkout entry
  behind a feature flag (expiry-dated), **tutoiement** copy, hidden until flip.

---

## Self-Review

**Spec coverage** — every spec section maps to a wave: architecture/cross-context
(W3), entitlement model+propagation (W3 domain, W5 consumers), provider posture +
Mollie adapter (W4), checkout/webhook/reconciliation (W4, W6), deletion-cancellation
invariant (W3 use case + W6 backstop), data/PII/retention (W3 schema, W4 Flyway),
schema-first contracts (W2), testing (every code wave), rollout/secrets/threat
model (W6 + ADR in W1), registry coherence (W1 ADR+INDEX, W3 CLAUDE.md table).
No orphan requirements.

**Placeholder scan** — W1/W2 carry concrete files, commands, and exact contract
shapes. W3–W6 are deliberately deferred to just-in-time plans for the documented
reasons (review-reshape + two blocking spec questions), not vague "TODO"s.

**Type consistency** — names align across waves: `Tier`, `Capability`,
`Subscription`, `SubscriptionStatus` (incl. `pending_cancellation`),
`Entitlement`, `BillingSource`, `externalRef`; `BillingProviderPort`
(`createCheckout`/`parseEvent`/`cancel`); `EntitlementChanged` payload identical
in W2 AsyncAPI and W3/W5 usage; `EntitlementView` capabilities array matches the
tier→capability mapping.
