# ADR-0082: Player email collection for billing/invoicing

## Status
Accepted

Supersedes ADR-0045 (the OAuth-scope and email-retention decisions).
Relates to ADR-0044 (identity OIDC sign-in), ADR-0078 (billing bounded
context PII posture), ADR-0025 (product analytics / RGPD posture).

## Context

ADR-0045 pinned a strict data-minimization stance for the `identity/`
context: request `openid` only on both Google and Apple, never fetch or
retain an email, and store no name, picture, or client IP. It made that
stance load-bearing on purpose — the OAuth scope is `openid` only in
`BeginOidcLoginUseCase` (with an inline comment forbidding the change),
`OidcIdToken` deliberately drops any `email`/`name`/`picture` claim the
IdP returns, `CompleteOidcLoginUseCase` writes `emailAtLink = null`, and
`MeResponse` exposes no email. ADR-0045's own "Why this is load-bearing"
section states that requesting `email` scope "would require this ADR to
be superseded" and that "the supersession discussion is the forcing
function that keeps minimization honest."

This ADR is that supersession, and here is the forcing function: the
subscription is going live. The maintainer operates WordSparrow through a
**French EURL with accounting** (ADR-0078), so the EURL is the legal
merchant. A French merchant selling a subscription is **legally required
to invoice paying customers**, and customers should receive a receipt.
Both the invoice and the receipt need the customer's email address. There
is no minimization argument that survives a statutory invoicing
obligation — the email is now collected by necessity, not by choice.

We could have collected the email only at the point of purchase (ask the
subscriber to type it into the checkout). The maintainer decided instead
to collect the verified email for **all signed-in players** at sign-in,
so that recovery is possible and the checkout flow is frictionless. This
ADR documents that decision and the narrow, purpose-limited processing
it entails.

## Decision

### OAuth scope — request `email`

- **Google:** `openid email` (was `openid`).
- **Apple:** `email` (was `openid`). Apple returns the email in two
  places: the `id_token` `email` claim, and — **only on the very first
  sign-in** — a `user` JSON field on the callback (`AppleCallbackRoute`).
  We must capture the email from that first-sign-in `user` field because
  Apple does not return it again on subsequent sign-ins. Apple **"Hide My
  Email"** relay addresses (`…@privaterelay.appleid.com`) are valid
  deliverable addresses and are accepted as-is; they are opaque to us but
  Apple forwards mail sent to them.

We still request **no** `profile`/`name` scope and capture **no** name or
picture — the delta from ADR-0045 is `email` and nothing else.

### Retain the verified email

`OidcIdToken` (and the Apple first-sign-in path) now **keep** the `email`
claim instead of dropping it. `CompleteOidcLoginUseCase` and the provider
link paths persist it.

**Storage model (recommended):** store a **canonical per-user email** —
a nullable `users.email` column — set and refreshed from the IdP at
sign-in and at provider-link. Email is a property of the billed *player*,
not of a specific IdP link, so the canonical column lives on `users`, not
on `identity_user_providers`. The existing per-provider
`identity_user_providers.email_at_link` column (the ADR-0045 opt-in
placeholder, always NULL today) may continue to capture per-provider
provenance if useful, but the canonical `users.email` is the single value
that billing and the UI read. This is the recommended model; the
implementation wave finalizes the exact column and migration
(expand-and-contract, ADR-0044 §CNPG posture).

### Scope of collection

Captured for **all signed-in players** at sign-in (maintainer decision),
**purpose-limited** to: billing/invoicing, receipts, and account
recovery. Not used for marketing, profiling, or analytics.

### Expose the email

- **identity `GET /v1/users/me`** gains a nullable `email` field so the
  player can see the address on file (shown on `/compte`).
- **identity `GET /v1/auth/whoami`** MAY carry the email for
  cross-context use — the same channel through which it already carries
  capabilities (ADR-0060 amendment, ADR-0079).
- **billing** reads the caller's email from identity via its existing
  `IdentityClient` whoami call (exactly as it already reads capabilities)
  and passes it to the **Mollie customer at creation** — today
  `MollieBillingAdapter` calls `client.createCustomer(userId.toString())`
  with no email; it will pass the email through so Mollie holds it for
  invoices and receipts.

**This narrows ADR-0078's "no PII in billing" posture, explicitly.**
ADR-0078 said the provider is system-of-record for PII and that billing
persists only opaque refs + entitlement state. That remains true for
*storage*: billing **stores no email**. The single change is that billing
now **passes the email through** to the provider at customer creation
instead of creating an email-less customer. Billing handles the email in
flight (identity → Mollie) and retains none of it.

### RGPD

- **Legal basis:** performance of the contract / compliance with a legal
  obligation (invoicing under the Code de commerce) — **not** consent and
  **not** legitimate-interest marketing. The email is processed because a
  merchant must invoice its customers.
- **Purpose limitation:** billing, receipts, and account recovery only.
- **Erasure — unchanged.** The email is a column on the `users` row, so
  it is deleted with the user through the existing `ON DELETE CASCADE`
  and the `UserDeleted` event (ADR-0044, ADR-0075). No new erasure path.
  Statutory invoice retention (Code de commerce ~10y, per ADR-0078) is
  satisfied by the **provider's** records, not ours — our copy is
  deletable on erasure.
- **Retention:** kept while the account exists; deleted on account
  deletion. Provider (Mollie) retains invoice records per its statutory
  obligation.
- **Everything else in ADR-0045 stays minimized:** still **no name, no
  picture, no client IP** in application code; the `__Secure-ws_session`
  cookie posture is unchanged; the account-enumeration-safe uniform
  sign-in response is unchanged.
- **`emailOptIn` is superseded.** ADR-0045's opt-in machinery — the
  post-sign-in consent screen, the `emailOptIn` field on `MeResponse` /
  `UpdateMeRequest`, and the `email_at_link != null` derivation of
  `emailOptIn` in `GetMeUseCase` — was built for an *optional*,
  player-typed email. Email is now collected by necessity for a legal
  purpose, so the opt-in framing is wrong and is retired. The
  implementation wave removes the opt-in consent surface and the
  `emailOptIn` field (or repurposes it to a read-only "email on file"
  indicator); it is no longer a consent toggle.

### Transparency

The **privacy notice** (`/confidentialite`) and the **sign-in surface**
must disclose that we collect the player's email and for what purpose;
the **CGV** must reference the email used for the invoice. The exact
wordings land in the implementation wave and require maintainer /
accountant validation.

## Consequences

**Easier:**
- Real, legally compliant invoices and receipts for paying customers.
- A verified email enables account recovery — the gap ADR-0045 flagged
  ("no email-based password recovery … irrecoverable") is closed.

**Harder / flagged:**
- **Reverses a load-bearing minimization stance.** The privacy notice and
  CGV must be updated *before* this ships; the DPA / records-of-processing
  (registre des traitements) should reflect the new processing activity —
  this is the accountant/DPO angle and needs the maintainer's review.
- **Billing now handles PII it previously never touched.** It is
  pass-through only (identity → provider, stored nowhere in billing), but
  it is still a widening of billing's data surface from strictly-opaque to
  PII-in-flight, and the ADR-0078 threat model wording should note it.
- **Apple relay addresses work but are opaque.** Mail to
  `…@privaterelay.appleid.com` is delivered, but we cannot recognize the
  underlying identity and the player can disable forwarding at any time.
- **Transparency copy is a merge precondition.** As with any new
  processing activity (ADR-0025 §5), the privacy-notice update gates the
  rollout; the wordings are DRAFT-à-valider until the maintainer/accountant
  sign off.

## Amendment to ADR-0045

ADR-0045's Status is set to `Superseded by ADR-0082`; its body is left
intact as the historical record of the minimization stance and why it was
load-bearing.
