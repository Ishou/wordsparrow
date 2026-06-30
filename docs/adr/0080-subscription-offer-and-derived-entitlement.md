# ADR-0080: Subscription offer + subscription-derived entitlement

## Status
Accepted

Finalizes the product offer that ADR-0078 (billing bounded context) deliberately
deferred. Extends ADR-0079 (capability-based feature authorization) and ADR-0060
(identity roles + capabilities). Relates to ADR-0075 (per-user grid-sync blob).

## Context
ADR-0078 shipped the billing plumbing — a hexagonal `billing` context, the Mollie
anti-corruption adapter, hosted-checkout/SAQ-A posture, the deletion-cancellation
invariant, and a `SubscriptionChanged(userId, tier, status)` event on
`wordsparrow.user.subscription-changed` — but **deliberately deferred the product
offer**: what is free vs paid, the price, and every consumer-facing surface.
ADR-0079 then made identity the single authorization authority and was explicit
that **subscription-TIER access (free vs paid grilles) is a separate axis,
out of scope** for it — to be ratified here.

The offer was designed via DEV-gated mockups (refined 2026-06-30, spec at
`docs/superpowers/specs/2026-06-30-subscription-user-path-mockups-design.md`),
iterated live with the maintainer under the ethical-pricing posture
(round prices, no pressure framing, the game stays free). This ADR ratifies that
offer and decides the **subscription-derived entitlement** wiring so the
production surfaces can be built (the "real subscription pages" workstream).

Three facts shape the entitlement decision:
- identity already owns capabilities and serializes `role` + `capabilities` on
  `whoami` and `/v1/users/me` via `capabilitiesFor(role)` (ADR-0079); there is
  **no tier field**, and — by ADR-0078/0079 design — consumers see
  **capabilities, never tiers**.
- identity currently only **publishes** events; it consumes none. billing emits
  `SubscriptionChanged` but nothing yet listens. survey's `UserRoleChanged`
  consumer (`survey/infrastructure/.../nats/UserRoleChangedConsumer.kt`) is the
  inbound-consumer pattern to mirror.
- the billing client already exposes the user's own subscription detail to the
  frontend: `getSubscription()` returns `SubscriptionView { tier, status,
  periodEnd }` (`frontend/src/application/billing/BillingClient.ts`) — the right
  source for manage-panel labels, distinct from the authz path.

## Decision

### The offer

- **One paid tier, no brand name.** The paid thing is referred to as
  « **l'abonnement** »; its card is titled « **Accès complet** »; an active user is
  « **abonné(e)** ». Two evocative brand names were considered and **rejected** —
  no tier name ships to the user. The internal `tier` string is **`subscriber`**
  (config-driven, never shown; billing's `Tier` is an open string, e.g.
  `Tier.of("subscriber")`; the tier set is `{ free, subscriber }`).

- **Gratuit** (no price shown — no redundant `0 €`):
  - la grille du jour,
  - les **7 derniers jours**,
  - **+ toute grille déjà commencée** (signed-in users) — "tu peux toujours
    finir ce que tu as commencé", tied to the per-user grid-sync blob (ADR-0075).

- **Accès complet:**
  - **toutes les grilles** · **tout l'historique**,
  - **génération** de grilles — fresh grids on demand; the verb is **générer**
    (not "à partir de tes mots"),
  - « **les nouveautés à venir** » — intentionally open-ended.

- **Gating rule (the single rule, enforced server-side):** a grid is **locked**
  when it is **older than 7 days AND not already started by the signed-in user**.
  The "already started" signal is the existing per-user grid-sync blob (ADR-0075).

- **Price:** **2 €/mois · 20 €/an**, TTC, with a mensuel/annuel toggle. Round
  prices only (no `,99`). A non-recurring **one-off month (2 €)**
  ("se termine tout seul — rien à résilier") is part of the offer *concept* but
  is **DEFERRED** from this rollout — it needs a Mollie one-time-payment flow
  distinct from the subscriptions path. Tracked as a planned follow-up.

- **Framing (binding) — neutral and factual, no hype, no pressure, no donation
  speech:** the copy states it plainly — the game is free; « l'abonnement »
  unlocks « Accès complet » (toutes les grilles + génération). Specifically:
  - **no commercial hype and no "soutiens le projet" / charity framing** — it is
    a feature-gated subscription, stated as features, not a cause;
  - **no "Recommandé" / pressure badge**, no fake urgency, no manufactured
    scarcity;
  - no redundant `0 €` on the Gratuit card;
  - reassurance line: "paiement sécurisé · sans engagement · résiliable à tout
    moment";
  - the provider (**Mollie**) is **never named** to the user;
  - **tutoiement** throughout ("tu / ta / tes / ton / toi").

### Subscription-derived entitlement (the wiring)

Entitlement is derived from **(role + tier)** and exposed through the **one**
capability interface identity already owns (ADR-0079: "capabilities are the
queried interface") — **consumers see capabilities, never tiers**, and never
learn billing exists.

- **identity gains a `SubscriptionChanged` consumer** — its **first inbound
  consumer** — mirroring survey's `UserRoleChanged` consumer. It persists the
  user's **tier internally** (last-write-wins by `userId` / `changedAt`, matching
  the event's documented semantics) and derives entitlement from **(role + tier)**.
  The tier is an internal authz input; it is **not** surfaced on whoami/me.

- **`capabilitiesFor(role, tier)`** replaces `capabilitiesFor(role)`: it keeps
  the role-derived capabilities and adds **tier-gated** capabilities for the
  `subscriber` (paid) tier:
  - **`grilles:all`** — play any archived grid (bypass the 7-day lock),
  - **`grilles:generate`** — generate fresh grids on demand.

  `whoami` and `/v1/users/me` serialize these in the existing **`capabilities`**
  array and **nothing else** — **no `tier` field is added** (a tier field would
  re-introduce exactly the tier-coupling ADR-0078/0079 designed away; consumers
  must gate on capabilities, not tiers). The frontend reads a thin
  **`useSubscriber()`** that is just a wrapper over `useCapability('grilles:all')`.

- **Manage-panel detail comes from the billing client, not whoami.** The
  Réglages "Ton abonnement" panel needs human labels (tier name, statut,
  prochaine échéance) — it reads those from the existing
  `getSubscription()` → `SubscriptionView { tier, status, periodEnd }` billing
  call (the caller's own subscription, ADR-0078's `GET /v1/subscription`), which
  is a distinct concern from authorization. Authz flows through capabilities;
  display flows through the billing subscription view.

  The `subscriber` tier string and the capability **names** (`grilles:all`,
  `grilles:generate`) are the maintainer-confirmable naming details.

- **Server-side enforcement (source of truth, ADR-0078/0079).** `grid` enforces
  the gating rule for archived-grid access and generation using the tier-derived
  capability read from the session principal (mirror the billing / survey / grid
  capability-source pattern: read from identity `whoami`, **absent capability ⇒
  deny**, no cross-context import). Frontend gates are **cosmetic**.

## Consequences

- **Easier:** the offer is ratified, so production surfaces can be built;
  entitlement flows through the single capability interface (no second authz
  source for consumers to merge); ambient upsell surfaces can gate on real
  entitlement state instead of fixtures.

- **Harder / flagged:**
  - **identity becomes a NATS consumer** for the first time — a new failure
    surface needing a **durable JetStream consumer provisioned** (configure-in-
    cluster, ADR-0049). This is the same class of issue as billing's
    `user.deleted` consumer-bootstrap gap — provision the durable consumer with
    the context, do not leave it implicit.
  - The **one-off month** and the **gift-a-month** surface are **deferred**
    pending a one-time-payment flow (distinct from the subscriptions API).
  - **Price** (`2 €` / `20 €`) and the **capability names** (`grilles:all`,
    `grilles:generate`) are flagged for maintainer confirmation. The exposure
    shape is **settled**: tier-derived capabilities only; whoami/me stay
    capabilities-only; manage-panel labels come from the billing subscription
    view.

- **Unchanged:** ADR-0078's deletion-cancellation invariant, hosted-checkout /
  SAQ-A posture, retention, multi-source design, and test-phase gating
  (`billing:subscribe`) all stand. This ADR only adds the offer + the tier axis
  ADR-0079 left out of scope.
