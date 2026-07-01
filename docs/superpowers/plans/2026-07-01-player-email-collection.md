# Player email collection for billing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — this repo dispatches each wave as
> one PR via the `dispatch` skill (worktree-isolated implementer → §6a review →
> merge → next wave). Steps use checkbox (`- [ ]`) syntax. Within a wave, follow
> TDD for domain/application logic: failing test first, then implementation.

**Goal:** Collect and retain the player's verified email so the EURL can issue
legally-required invoices and receipts. Ratify the governance (W1, this PR),
wire email through identity (W2) and billing pass-through (W3), then update the
consumer surfaces and legal copy (W4).

**Architecture:** identity requests the `email` OAuth scope, retains the verified
email as a canonical `users.email` column, and exposes it on `/me` (+ whoami for
cross-context reads). billing reads the caller's email from identity via its
existing `IdentityClient` whoami call and passes it to the Mollie customer at
creation — storing none itself. This narrows ADR-0078's "no PII in billing" to
pass-through only. Erasure is unchanged (email deleted with the user via the
existing `ON DELETE CASCADE` + `UserDeleted`).

**Tech Stack:** Kotlin 2.3.21 + Ktor (identity, billing: domain/application/
infrastructure/api), kotlinx-serialization, Flyway (CNPG), Nimbus JOSE (OIDC),
Mollie SDK, Testcontainers, Konsist; Vite + React 19 + TS + Panda CSS (frontend).

**ADR:** `docs/adr/0082-player-email-collection-for-billing.md` (supersedes
ADR-0045's OAuth-scope + email-retention decisions; relates ADR-0044, ADR-0078,
ADR-0025). The storage model (canonical `users.email`) is the recommended model —
W2 finalizes the exact column. All copy is DRAFT-à-valider pending
maintainer/accountant sign-off.

## Global constraints

- Schema-first (ADR-0001 §3, ADR-0003): any `identity/api/openapi.yaml` change
  ships as a **schema-only PR first**, before producer/consumer PRs. Frontend
  types regenerate via `pnpm api:check`.
- **Migrations are expand-and-contract** (ADR-0044 CNPG posture): add the
  nullable column, backfill from the IdP on next sign-in; no destructive step.
- **400-line diff cap** per PR (excl. generated code) — invoke the standing
  override with justification if a wave legitimately exceeds it.
- Conventional commits, bounded-context scope, `-s` sign-off; branch
  `<type>/<desc>`; no emojis.
- French copy uses **tutoiement** ("tu", never "vous").
- No `println` / `console.log`; structured logs only. Comments: one line,
  non-obvious *why* only; no multi-line blocks.
- **RGPD:** email is purpose-limited to billing/receipts/recovery. Do not log
  the email; do not send it to analytics; do not add name/picture/IP.

## Wave 1 — Governance (this PR, DOCS ONLY)

- [x] ADR-0082 authored (`Accepted`; supersedes ADR-0045 OAuth-scope + email
      retention; relates ADR-0044/0078/0025).
- [x] ADR-0045 marked `Superseded by ADR-0082` (body preserved as history).
- [x] `docs/adr/INDEX.md`: ADR-0082 binding rows (identity oidc/user/email paths;
      billing customer-email pass-through) + ADR-0045 supersession note.
- [x] This plan.
- Gate: `adr-index-coherence` (ADR ↔ INDEX pairing), commitlint, dco, branch-name,
  gitleaks.

## Wave 2 — identity: request, retain, expose the email

Schema-only sub-PR first, then implementation.

- [ ] **Schema (first PR):** `identity/api/openapi.yaml` — add nullable `email`
      to the `/v1/users/me` response; add `email` to `/v1/auth/whoami` if billing
      needs it there (W3 confirms). Retire / repurpose `emailOptIn` (it becomes a
      read-only indicator or is removed). `openapi-lint` + regen-and-diff green.
- [ ] **OAuth scope:** `BeginOidcLoginUseCase` requests `openid email` (Google)
      and `email` (Apple); update the inline comment that currently forbids it to
      cite ADR-0082. Remove the ADR-0045 "changing this requires superseding"
      comment.
- [ ] **Retain the claim:** `OidcIdToken` keeps `email`; `JoseOidcVerifier`
      surfaces it. Apple path (`AppleCallbackRoute`) captures the email from the
      first-sign-in `user` JSON field (Apple returns it only once); accept
      `…@privaterelay.appleid.com` relay addresses as valid.
- [ ] **Persist:** Flyway migration adds the recommended nullable `users.email`
      column (expand-and-contract; per-provider `email_at_link` may keep
      provenance). `CompleteOidcLoginUseCase` + `CompleteProviderLinkUseCase`
      set/refresh `users.email` at sign-in and link (was `emailAtLink = null`).
- [ ] **Expose:** `GetMeUseCase` / `MeResponse` carry the nullable `email`;
      whoami carries it if W3 needs it. Remove/repurpose the `emailOptIn`
      derivation and the opt-in consent surface.
- [ ] **Erasure:** confirm the email column is covered by the existing
      `ON DELETE CASCADE` + `UserDeleted` event — add a test asserting the email
      is gone after `DELETE /v1/users/me`. No new erasure path.
- [ ] Tests: OAuth-scope assertion; email retained through verify → complete →
      persist; Apple first-sign-in capture + relay address; `/me` exposes email;
      erasure test. Property test for email round-trip if a parser is added.

## Wave 3 — billing: pass the email through to Mollie

- [ ] `MollieBillingAdapter` reads the caller's email from identity via the
      existing `IdentityClient` whoami call (the same channel it reads
      capabilities from) and passes it to `client.createCustomer(...)` — extend
      `MollieClient.createCustomer` / `SdkMollieClient` / `FakeMollieClient` to
      accept the email alongside the user reference.
- [ ] **Store nothing:** billing persists no email; assert the projection /
      customer store holds only opaque refs (ADR-0078 posture, now narrowed to
      pass-through in ADR-0082).
- [ ] Tests: customer created with the email when identity has one; created
      without (email null) when it does not; billing stores no email; a
      whoami-without-email caller does not break checkout.

## Wave 4 — frontend + legal wordings (all copy DRAFT-à-valider)

- [ ] `/compte`: show the email on file (read from `/me`), nullable-safe.
- [ ] Sign-in / collection disclosure: a short line at the sign-in surface that
      we collect the email for billing + receipts + recovery.
- [ ] **Confidentialité** (`/confidentialite`): add an email/billing/processor
      paragraph (what, why — invoicing legal obligation, Mollie as processor,
      retention, erasure).
- [ ] **CGV:** reference the email used for the invoice/receipt.
- [ ] Re-add the merci line « un reçu t'a été envoyé par e-mail » — now truthful
      once Mollie's dashboard email toggle is enabled. **Caveat:** verify Mollie's
      invoice/receipt email is actually turned on in the provider dashboard before
      claiming the receipt is sent; if the toggle is off the line is false.
- [ ] Flag for maintainer/accountant: all legal copy (confidentialité, CGV) plus
      the DPA / records-of-processing (registre des traitements) update need human
      validation before merge — this is the accountant/DPO angle from ADR-0082.

## Notes / open items

- **DPA / records-of-processing** must reflect the new processing activity
  (email for invoicing) — outside the code but a merge precondition for the
  legal surface (ADR-0082 Consequences).
- **Exact `users.email` column** and whether whoami carries the email are
  finalized in W2/W3; the ADR states the recommended model, not a locked schema.
- **`emailOptIn` disposition** (remove vs repurpose to read-only) is decided in
  W2 — it is no longer a consent toggle.
