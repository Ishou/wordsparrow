# Design: Passwordless email-OTP login

**Date:** 2026-07-03
**Context:** `identity/` bounded context (ADR-0044)
**Status:** Draft — brainstormed, pending implementation plan

## Summary

Add a passwordless **email one-time-code (OTP)** sign-in path to the
`identity/` context, alongside the existing Google + Apple OIDC providers.
A player enters their email, receives a 6-digit code by email, types it back
in the same browser, and gets a session — no Google/Apple account required,
and no password anywhere.

This makes **email a first-class login provider**, not just the billing
attribute it became in ADR-0082.

## Goals

- Sign in / sign up with an email address, no third-party IdP, no password.
- One human = one account: an email-OTP login for an address already on a
  Google/Apple account resolves to **that** account (paid-product: no split
  subscription / progress).
- Security posture at least as strong as the OIDC path, with an explicit
  threat model (required for auth changes, CLAUDE.md).

## Non-goals (explicitly deferred)

- **Passwords** — rejected outright; the whole point is passwordless.
- **Magic links** — rejected (see Mechanism).
- **Passkeys / WebAuthn** — the modern end-state, but an *authentication*
  method layered on an identifier, needing device-sync fallback. A future
  ADR, not this feature.
- **Explicit "link email from settings"** — auto-link on verified-email match
  (below) covers the common case; explicit multi-email linking is YAGNI for v1.
- **Full cross-provider merge by verified email** (making Google↔Apple with a
  shared email collapse to one account) — a retroactive account-merge project
  with its own ADR. Out of scope; see Account model.
- **"New sign-in" notification email** — desirable, adds transactional-email
  scope; ships as a fast-follow, not in core.

## Decisions

### Mechanism — email OTP (6-digit code), not magic link

Chosen over magic link because WordSparrow is a **PWA**:

- **Same-context redemption.** OTP stays in the originating tab/PWA. Magic
  links open in whatever handles them (Gmail in-app webview, OS default
  browser) — not the installed PWA — stranding the user in the wrong context.
- **Immune to link scanners.** Corporate mail security / Outlook SafeLinks /
  prefetchers *click* links and consume single-use tokens before the human
  does. A code is not clickable.
- **Reuses existing UI.** The segmented-code input component (PIN pattern,
  placeholder `_`) is already in the frontend.
- **Reuses an existing backend shape.** `identity_auth_attempts` already models
  a short-lived, single-use, TTL-indexed challenge.

### Account model — one human = one account, keyed on verified email (Option B)

The current model keys accounts on **`(provider, subject)`**;
`users.email` is a **nullable, non-unique, billing-only** attribute
(ADR-0082) refreshed from the IdP on each login. Consequently Google and
Apple sign-ins with the same email are **already separate accounts today** —
there is no email-based merging.

Email-OTP makes email a first-class provider (`provider = 'email'`) and
resolves a verified OTP login in this order:

1. An existing `('email', <normalizedEmail>)` provider link → **that account**.
2. Else, exactly **one** existing account has `users.email == normalizedEmail`
   → **attach** an `('email', …)` link to it and sign in.
   *Safe:* OTP proves control of the inbox — the same proof Google/Apple gave
   us for that email. The inbox was always the root of trust.
3. Else (zero matches, **or** >1 ambiguous match from legacy Google+Apple
   duplicates) → **create a fresh account**. Never auto-merge on ambiguity.

New-account creation mirrors OIDC: `display_name = "Joueur"` (default,
editable via `PATCH /v1/users/me`); no forced onboarding step.

**Email normalization:** trim + lowercase only. No provider-specific
canonicalization (Gmail dot/plus stripping is fragile and would wrongly merge
distinct addresses at other providers).

**Accepted asymmetry:** email-OTP merges on shared verified email;
Google↔Apple still do not (unchanged). Full unification is the deferred
merge ADR above.

### Security — challenge-cookie binding + global session revocation

Two levers, both included. Threat driving them: a user leaks the OTP code
(e.g. read aloud on a live stream) and an attacker on another machine tries
to redeem it.

**Lever 1 — HttpOnly challenge-cookie binding (source).** This is
PKCE-style binding — the same property the OIDC flow already gets from
`pkce_verifier`, i.e. "only the initiating client can redeem." Since OTP is
inherently same-device, `start` sets a random, single-use, short-TTL
**`Secure; HttpOnly; SameSite=Lax` challenge cookie**; `verify` requires
**code + matching challenge cookie**. A code leaked on stream and typed into
the attacker's browser has no matching cookie → rejected.

- Bind pre-auth to the *initiating browser instance* (no session exists yet);
  the session is minted only on successful verify.
- HttpOnly (not a frontend-held JS salt): out of reach of XSS, threaded
  automatically by the browser, server-controlled lifetime. A static
  bundle-baked salt would be no secret at all; a per-session JS salt is
  XSS-readable. The cookie is strictly stronger.

**Lever 2 — global "sign out everywhere" (containment).** Provider-agnostic
(helps Google/Apple sessions too). `POST /v1/auth/logout-all` revokes all the
user's sessions, **keeping the caller's current device** and killing every
other — maps to the leak scenario (you're on your machine; nuke the intruder).
Surfaced on `/compte`. The session model already supports this cheaply:
`identity_sessions` is `user_id`-keyed and indexed, `revoked_at` supports
soft-revoke, and `SessionRepository.deleteForUser` exists.
*Why containment is sufficient here:* the attacker cannot re-enter after
revocation — re-authenticating requires the inbox they never had (contrast a
leaked password, which stays valid after logout).

**Residual (accepted, documented):** neither lever stops a real-time phishing
proxy relaying `start` + code + challenge cookie. Only passkeys close that;
out of scope.

### Email delivery — port now, paid provider by separate ADR

**There is no transactional email path in the repo today** (verified: no
mail-sending code in any `.kt`; no email-provider dependency). ADR-0032's
Gmail SMTP is wired into the observability/alerting layer and is not callable
from `identity-api`, nor adequate for transactional volume/deliverability.

- Define an **`EmailSender` port** in `identity/application/`. The OTP use
  case depends only on the port; the provider is a swappable infra adapter.
- **Chosen provider: Brevo** (maintainer decision, 2026-07-03). Rationale:
  French company, **EU-hosted by default** (FR/DE data centers, DPA built in),
  keeping the data-transfer story clean for a French EURL and consistent with
  the identity context's RGPD-minimal posture; mature + well-documented; free
  tier covers current volume. This is a **paid third-party service**, so it
  still lands via **its own ADR** with the maintainer approval on record.
  (Scaleway TEM considered as the more sovereign alternative; Postmark as the
  deliverability-leader fallback if inbox placement ever bites — both remain
  swappable behind the port.)
- **Domain authentication is the real deliverability lever** (provider-agnostic):
  SPF + DKIM + DMARC DNS records on a dedicated sending subdomain
  (e.g. `no-reply@wordsparrow.io` / `mail.wordsparrow.io`). Part of the Wave-3
  adapter work, not a manual afterthought.
- **Gating:** nothing ships until Brevo is live and verified end-to-end
  (real code delivered, redeemed, session minted). Provider setup runs as a
  **parallel track**; the auth design does not block on it (port-first).

## Domain / schema changes

- **Migration — provider allowlist (expand-and-contract).** Extend the
  `CHECK (provider IN ('google','apple'))` on **`identity_user_providers`** to
  include `'email'` (this is where the `('email', …)` link rows are written).
  Expand first (widen the constraint) before code writes `'email'`.
  `identity_auth_attempts` is OIDC-only (email-OTP uses its own challenge
  table) and is left unchanged.
- **Migration — OTP challenge table**, e.g. `identity_email_otp_challenges`:
  `challenge_id UUID PK`, `email TEXT NOT NULL` (normalized),
  `code_hash TEXT NOT NULL` (code stored **hashed**, never plaintext),
  `binding_hash TEXT NOT NULL` (hash of the challenge-cookie value),
  `attempts INT NOT NULL DEFAULT 0`, `created_at`, `expires_at TIMESTAMPTZ`,
  `consumed_at TIMESTAMPTZ`. Index on `expires_at` for TTL cleanup.
- **Domain:** an `EmailOtpChallenge` type (invariants: TTL, single-use,
  attempt cap) with property-based tests (serialization/validation, CLAUDE.md).
- **Ports:** `EmailSender`; `EmailOtpChallengeRepository`; a global-revoke use
  case over the existing `SessionRepository.deleteForUser` (excluding caller).
- Provider enum / `Provider.toWire()` gains `email`.

## API contract (schema-first, ADR-0003)

Schema-only PR to `identity/api/openapi.yaml` first; then producer + consumer.
New operations:

- `POST /v1/auth/email/start` — body `{ email }`. Sends a code; sets the
  challenge cookie. **Enumeration-safe uniform 202** regardless of whether the
  email is known (and note: every email is valid here — unknown → new account —
  so there is inherently no "not found" path, consistent with ADR-0044).
  Rate-limited (below).
- `POST /v1/auth/email/verify` — body `{ email, code }` + challenge cookie.
  On success mints `__Secure-ws_session` and returns the user (same shape as
  OIDC callback completion). Failure: uniform error; increments attempt count;
  locks the challenge after the cap.
- `POST /v1/auth/logout-all` — cookie-authed; revokes all other sessions.

## OTP mechanics / defaults

(values are recommendations; confirm at implementation)

- Code: **6 digits**, generated with `SecureRandom` (reuse
  `SecureRandomFactory`).
- **TTL 10 min**, **single-use**, stored **hashed**.
- **Verify attempt cap 5** per challenge → lock, require a fresh `start`.
- **Resend cooldown 60s** per email; **daily send cap** per email; **per-IP**
  cap. ingress-nginx rate-limits (ADR-0030) plus app-level throttle on
  `start` (it triggers email sends = spam/cost vector).

## Threat model (auth change — required)

- **Leaked code** → challenge-cookie binding (Lever 1).
- **Brute force** → 6-digit space + attempt cap + short TTL + lock.
- **Email bombing / cost abuse** → resend cooldown, per-email daily cap,
  per-IP cap.
- **Account enumeration** → uniform `start` response; no "not found" path.
- **Replay** → single-use, TTL, consumed-at.
- **Session fixation** → reuse existing `__Secure-ws_session` issuance posture
  (unchanged).
- **Auto-link abuse** → merge only on inbox-proven verified-email match; never
  on ambiguity.
- **Phishing proxy** → accepted residual (passkeys out of scope).
- **Compromise containment** → global session revocation (Lever 2).

## Frontend surface

- Email-entry screen → code-entry screen (reuse segmented-code input).
- Copy in **tutoiement** (CLAUDE.md; imported designs default to "vous" — grep
  new copy).
- **WCAG AA** (ADR-0050); segmented input a11y (labels, live region for
  errors, no aria-live spam).
- **"Se déconnecter de tous les appareils"** action on `/compte`.

## Governance

- **ADR — email-OTP passwordless login** (mechanism + account-model decision +
  threat model). Extends/references ADR-0044, ADR-0045, ADR-0082; adds `email`
  to the provider set.
- **ADR — transactional email provider = Brevo** (paid service; EU residency;
  maintainer approval on record; SPF/DKIM/DMARC domain-auth posture).
- Update **`docs/adr/INDEX.md`** (path→ADR) in the same PR as each ADR
  (registry-coherence gate).
- `identity/` is an existing context — no bounded-contexts-table change.

## Rollout — PR waves (ADR-0001; plan-as-waves)

1. **Wave 1 — governance:** the two ADRs + INDEX updates + the schema-only
   `openapi.yaml` PR. Maintainer approves the paid-provider ADR before Wave 3.
2. **Wave 2 — identity backend:** migrations (expand), domain +
   `EmailOtpChallenge`, use cases, `start`/`verify`/`logout-all` routes,
   `EmailSender` port + a stub/no-op adapter, behind a **feature flag (dark)**.
3. **Wave 3 — email adapter:** concrete provider adapter + secrets, once the
   provider ADR is approved and a domain/sender is verified.
4. **Wave 4 — frontend:** email + code screens, `/compte` sign-out-everywhere.
5. **Release bright:** flip the flag after end-to-end verification (real email
   delivered, code redeemed, session minted, revocation works). Flag carries an
   expiry date.
6. **Fast-follow:** "new sign-in" notification email.

## Open decisions

- ~~Email provider choice~~ — **resolved 2026-07-03: Brevo** (EU-hosted,
  French; via its own paid-service ADR).
- OTP numeric constants (TTL 10 min / attempt cap 5 / resend cooldown 60s) —
  defaults stand unless the maintainer wants them tuned.
