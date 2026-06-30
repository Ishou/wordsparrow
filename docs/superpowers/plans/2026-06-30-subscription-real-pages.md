# Subscription "real pages" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — this repo dispatches each wave as
> one PR via the `dispatch` skill (worktree-isolated implementer → §6a review →
> merge → next wave). Steps use checkbox (`- [ ]`) syntax. Within a wave, follow
> TDD for domain/application logic: failing test first, then implementation.

**Goal:** Turn the approved subscription mockups (DEV-gated, on branch
`worktree-feat+subscription-user-path-mockups`) into production: ratify the offer
(W1, this PR), wire subscription-derived entitlement end-to-end (W2), then port
the refined mockup components to real routes (W3–W6).

**Architecture:** The UI build is largely **porting the refined mockup
components** under `frontend/src/ui/v2/mockups/*` to production — swap fixtures
for the real billing client (`createHttpBillingClient`, `useSubscription`) and
the new `useSubscriber()` / capability hooks, and register at real routes. The
entitlement axis (W2) extends ADR-0079's capability interface with `(role + tier)`.

**Tech Stack:** Kotlin 2.3.21 + Ktor (identity, grid: domain/application/
infrastructure/api), kotlinx-serialization, NATS JetStream, Testcontainers,
Konsist; Vite + React 19 + TS + Panda CSS + Ark UI (frontend); Vitest + Playwright.

**Spec:** `docs/superpowers/specs/2026-06-30-subscription-user-path-mockups-design.md`
(read its "As-built (2026-06-30)" section).
**ADR:** `docs/adr/0080-subscription-offer-and-derived-entitlement.md` (offer +
entitlement decisions; entitlement shape is settled — tier-derived capabilities
only, whoami capabilities-only, manage labels from the billing subscription view).

## Global constraints

- Schema-first (ADR-0001 §3, ADR-0003): any `*/api/openapi.yaml`,
  `asyncapi.yaml`, or merged-schema change ships as a **schema-only PR first**,
  before the producer/consumer PRs. Frontend types regenerate via `pnpm api:check`.
- **400-line diff cap** per PR (excl. generated code) — invoke the standing
  override with justification if a wave legitimately exceeds it.
- Conventional commits, bounded-context scope, `-s` sign-off; branch
  `<type>/<desc>`; no emojis.
- French copy uses **tutoiement** ("tu", never "vous").
- No `println` / `console.log`; structured logs only. Comments: one line,
  non-obvious *why* only; no multi-line blocks.
- **Server is the source of truth** (ADR-0078/0079); frontend gates are cosmetic.
- **Screenshot-verify against the mockup is the DoD for every UI wave** — render
  under `pnpm dev`, compare each surface × state against the mockup gallery.
- Per-wave **ADR pre-read**: run `scripts/adr-context.sh <paths>` and inline the
  output into the implementer prompt before writing code.

## Wave dependency map / ordering

```
W1 (governance) ──► W2 (entitlement wiring, BARRIER) ──┬─► W3 (offer page)
                                                       ├─► W4 (merci + manage)   [needs W2]
                                                       ├─► W5 (paywall + upsell) [needs W2]
                                                       └─► W6 (transparency + end-of-sub)
```

W2 is a **barrier**: W4 and W5 gate on `useSubscriber()` / capabilities and on
grid's server-side enforcement, all delivered by W2. W3 only needs the billing
checkout client (already built, ADR-0078) so it can land in parallel with W2 if
desired, but list it after W2 to keep one linear queue. W6 is independent polish.

**Out of scope / tracked separately:** the **one-off month** purchase and the
**gift-a-month** surface (need a Mollie one-time-payment flow, not the
subscriptions API); a cluster-wide CNPG right-size.

---

## Wave 1 — Governance (this PR)

**Branch:** `docs/subscription-real-pages` · **Scope:** `docs(adr-0080):`
**Gate:** `adr-index-coherence`, `commitlint`, `dco`. Docs only.

- [ ] **1.1** `docs/adr/0080-subscription-offer-and-derived-entitlement.md`
  (Status: Accepted) — offer + subscription-derived entitlement.
- [ ] **1.2** This plan, `docs/superpowers/plans/2026-06-30-subscription-real-pages.md`.
- [ ] **1.3** `docs/adr/INDEX.md` — ADR-0080 binding rows.
- [ ] **1.4** Commit `docs(adr-0080): subscription offer and subscription-derived entitlement`.

---

## Wave 2 — Entitlement wiring (BARRIER)

**Goal:** identity consumes `SubscriptionChanged`, persists tier **internally**,
derives `capabilitiesFor(role, tier)`; whoami/me expose **only the existing
`capabilities` array** (no `tier` field); durable JetStream consumer provisioned;
frontend reads `useSubscriber()` (a wrapper over `useCapability('grilles:all')`).

**Pre-read:** `scripts/adr-context.sh identity/domain/src/main/kotlin/com/bliss/identity/domain/user/Capability.kt billing/api/asyncapi.yaml frontend/src/ui/v2/useCapabilityGate.ts`
(ADR-0080, 0079, 0060, 0078, 0049).

**Entitlement shape is settled (ADR-0080):** tier-derived capabilities **only** —
`capabilitiesFor(role, tier)` grants `grilles:all` / `grilles:generate` for the
`subscriber` (paid) tier; consumers gate on capabilities, **never on a tier
field**. whoami/me stay capabilities-only. Manage-panel labels come from the
billing client's `getSubscription()` (W4), not whoami. Confirmable detail: the
capability names + the `subscriber` tier string.

This wave may split into a schema-only PR (whoami/me capabilities-enum + asyncapi
consumption contract) then a backend+frontend PR if the diff exceeds the cap.

### Task 2.1 — identity `SubscriptionChanged` consumer + tier persistence
**Files (mirror survey's consumer):**
- New: `identity/infrastructure/src/main/kotlin/com/bliss/identity/infrastructure/nats/SubscriptionChangedConsumer.kt`
  (+ `...ConsumerConfig.kt`), modelled on
  `survey/infrastructure/.../nats/UserRoleChangedConsumer.kt`.
- New: identity application port + use case to apply a tier change
  (last-write-wins by `userId` / `changedAt`).
- New: persistence for per-user tier (Flyway migration under
  `identity/infrastructure/.../db/migration/`, expand-and-contract).
- Tests: consumer test (Testcontainers/NATS, mirror
  `UserRoleChangedConsumerTest.kt`); last-write-wins drops a stale `changedAt`.

### Task 2.2 — `capabilitiesFor(role, tier)` + tier-gated capabilities
**Files:**
- Modify: `identity/domain/src/main/kotlin/com/bliss/identity/domain/user/Capability.kt`
  — add `GRILLES_ALL("grilles:all")`, `GRILLES_GENERATE("grilles:generate")`;
  change `capabilitiesFor(role: Role?)` → `capabilitiesFor(role: Role?, tier: Tier?)`,
  granting the tier-gated caps when `tier == subscriber`. (`Tier` is a local
  identity value type — do **not** import `billing/domain`; cross-context imports
  are forbidden. The consumer maps the event's open `tier` string at the edge.)
- Modify: `identity/.../usecases/WhoAmIUseCase.kt` + `GetMeUseCase.kt` to pass the
  persisted tier into `capabilitiesFor(role, tier)`. **Do not add a `tier` field**
  to the responses — the `capabilities` array is the only authz surface.
- Modify: `identity/domain/src/test/kotlin/.../CapabilityTest.kt`.

### Task 2.3 — whoami / me schema + types
**Files:**
- Modify: identity `api/openapi.yaml` — add the new capability strings
  (`grilles:all`, `grilles:generate`) to the `capabilities` enum (schema-only
  first). **No `tier` field is added.**
- Frontend: regenerate identity types (`pnpm api:check`); no hand-edits.

### Task 2.4 — durable JetStream consumer bootstrap
**Files:** add the durable consumer to the identity NATS provisioning the same
way billing/survey do (configure-in-cluster Helm `post-install,post-upgrade` Job;
mirror `infra/nats/templates/stream-bootstrap-job.yaml`). Note the existing
billing `user.deleted` consumer-bootstrap gap is the same class of issue — do not
leave the durable consumer implicit.

### Task 2.5 — frontend `useSubscriber` + capability hooks
**Files:**
- New: `frontend/src/ui/components/billing/useSubscriber.ts` — a thin boolean
  wrapper over `useCapability('grilles:all')` (NOT `tier`-based; `useSubscription`
  is already the billing-status hook, so this is named `useSubscriber`).
- Use the existing `frontend/src/ui/components/billing/useCapability.ts` /
  `useSubscription.ts` for `useCapability('grilles:all')`.
- Tests under `frontend/tests/`.

**DoD:** integration test — a published `SubscriptionChanged(subscriber, active)`
makes `whoami` return `grilles:all` / `grilles:generate` in `capabilities` (and
**no** `tier` field); last-write-wins respected; durable consumer survives a
restart.

---

## Wave 3 — Offer page `/abonnement`

**Goal:** replace the minimal `AbonnementScreen` with the two-card offer
(« Accès complet » / « l'abonnement »), 2 €/20 € mensuel-annuel toggle, neutral
factual framing, wired to `createCheckoutSession`.

**Port from:** `frontend/src/ui/v2/mockups/OfferPage.tsx` (two-card, as-built),
`AbonnementMockups.tsx`, `fixtures.ts`.
**Files:**
- Rework: `frontend/src/ui/v2/AbonnementScreen.tsx` (route `frontend/src/ui/routes/abonnement.tsx`).
- Wire: `frontend/src/application/billing/BillingClient.ts` /
  `frontend/src/infrastructure/api/billing/client.ts` checkout-session call.
- Remove fixtures; keep copy inline (tutoiement, neutral framing, reassurance
  line, provider never named).
- **Existing-code follow-up (rename the tier id):** the merged
  `AbonnementScreen.tsx` calls `createCheckoutSession('premium')` and
  `frontend/tests/abonnement-route.test.tsx` / `abonnement-succes-route.test.tsx`
  use the `'premium'` string. Rename every such occurrence to the `subscriber`
  tier id when this wave reworks the screen — no `'premium'` string survives.
**DoD:** screenshot-verify against the mockup OfferPage; no real charge (test
mode); grep confirms `'premium'` is gone from `frontend/`.

---

## Wave 4 — `/abonnement/merci` + Manage panel (needs W2)

**Goal:** post-checkout confirmation + a "Ton abonnement" section in réglages
with cancel, wired to `useSubscription` / cancel.

**Port from:** `mockups/MerciScreen.tsx`, `mockups/ManagePanel.tsx`.
**Files:**
- Rework: `frontend/src/ui/v2/AbonnementSuccesScreen.tsx`
  (route `abonnement.succes.tsx`) → the « Te voilà abonné·e ! » confirmation.
- Add a "Ton abonnement" `SettingsRow` section to
  `frontend/src/ui/v2/ReglagesScreen.tsx` (tier label, statut, prochaine
  échéance) reading `useSubscription` (`getSubscription()` →
  `SubscriptionView { tier, status, periodEnd }`, ADR-0078); cancel dialog →
  `frontend/src/ui/v2/AbonnementAnnuleScreen.tsx` / cancel client call; render the
  `pending_cancellation` state ("Ton accès reste actif jusqu'au …" + "Réactiver").
**DoD:** screenshot-verify each state (actif / pending_cancellation) against the
ManagePanel mockup. **Labels come from the billing `SubscriptionView`, not
whoami** (authz vs display are separate concerns, ADR-0080); ambient gating uses
`useSubscriber`.

---

## Wave 5 — Paywall + upsell (needs W2)

**Goal:** locked-grid markers + gating dialog + ambient upsell, gated on
`useSubscriber`; **grid server-side enforcement** of the gating rule.

**Port from:** `mockups/ArchiveLockedMock.tsx`, `mockups/AbonnementSheet.tsx`,
`mockups/UpsellEntries.tsx`.
**Files:**
- `frontend/src/ui/v2/GrillesArchiveScreen.tsx` — cadenas badge on locked cards
  (locked = older than 7 days AND not started), archive upsell banner when free.
- New: `frontend/src/ui/v2/AbonnementSheet.tsx` (Ark UI Dialog cloning
  `MenuSheet.tsx`) — locked-grid + generate gating, contextual copy.
- Upsell entries: home teaser + réglages upsell row + archive banner (the
  `UpsellEntries` set), all gated on `useSubscriber`.
- **grid backend:** enforce the gating rule server-side for archived-grid access
  + generation using the tier-derived capability via the session principal
  (mirror grid's existing capability-source pattern; read from identity whoami,
  absent ⇒ deny). Tests in `grid/application` + `grid/api`.
**DoD:** screenshot-verify locked/started/recent card states; a server test
proves a free user is denied a locked grid + generation even with the frontend
gate stripped.

---

## Wave 6 — Section E: transparency + gentle end-of-subscription

**Goal:** the "où va ton argent" transparency panel (incl. *fait par une seule
personne*, *pas de pub*) and the gentle end-of-subscription screen.

**Port from:** `mockups/ExploratoryMockups.tsx` (Section E).
**Files:** new components under `frontend/src/ui/v2/` + wiring into the relevant
surface (réglages / end-of-sub). Inline copy, tutoiement.
**DoD:** screenshot-verify against the Section-E mockups.
**Note:** the **gift-a-month** surface from Section E is **DEFERRED** with the
one-off-payment flow — do not build it in this wave.
