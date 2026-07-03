# ADR-0091: Passwordless email-OTP login

## Status
Accepted — relates to ADR-0044 (identity context, session cookie), ADR-0045
/ ADR-0082 (data minimization / email retention), ADR-0077 (credentialed
CORS session posture). Extends the login-provider set beyond `{google, apple}`.

## Context

Player sign-in today is OIDC only (Google + Apple, ADR-0044). ADR-0082 made
the player's verified email a retained attribute of an OIDC login (for legal
invoicing), but there is still no way to sign in **with an email address**
without a third-party IdP. Some players don't have — or don't want to use — a
Google/Apple account; a paid product should not force one.

Passwords are rejected outright: a stored password is a new secret to hash,
breach, and recover, and it duplicates the inbox-control proof we already
rely on. Magic links are rejected because WordSparrow is a PWA — links open in
the mail client's in-app webview or the OS default browser, not the installed
PWA, and single-use link tokens are consumed by corporate mail scanners
(SafeLinks) and prefetchers before the human clicks. A **one-time numeric code
(OTP)** stays in the originating tab, reuses the existing segmented-code input,
and is immune to link scanners.

## Decision

### Mechanism — email OTP

- A player enters an email; the server emails a **6-digit code** (`SecureRandom`,
  10-minute TTL, single-use). The player types it back **in the same browser**;
  a valid code mints the standard `__Secure-ws_session` (ADR-0044), identical to
  the OIDC completion path.
- The code is stored **hashed** (SHA-256), never in plaintext.
- `POST /v1/auth/email/start` (unauthenticated) and `POST /v1/auth/email/verify`
  are the two endpoints. Delivery is via the `EmailSender` port (ADR-0092).

### Email is a first-class login provider

- A new provider value `email` joins `identity_user_providers.provider`
  (expand-and-contract migration; `identity_auth_attempts` stays OIDC-only).
- Account resolution on a verified OTP (**"one human = one account"**, keyed on
  verified email):
  1. an existing `('email', <normalized-email>)` link → that account;
  2. else, **exactly one** account whose `users.email` matches → attach an
     `('email', …)` link to it and sign in;
  3. else (zero, **or** more-than-one ambiguous legacy match) → create a fresh
     account. **Never auto-merge on ambiguity.**
- New accounts mirror OIDC: default `display_name = "Joueur"`, no forced
  onboarding step.
- **Email normalization is trim + lowercase only** — no provider-specific
  canonicalization (Gmail dot/plus stripping would wrongly merge distinct
  addresses at other providers).
- **Accepted asymmetry:** email-OTP merges on shared verified email; Google↔Apple
  logins sharing an email stay separate (unchanged from today). Full
  cross-provider merge is a deferred, retroactive project with its own ADR.

### Why merging on verified email is safe

OTP proves control of the inbox — the same proof Google/Apple gave us when they
vouched for that email. The inbox was already the root of trust (Google account
recovery already flows through it). Email-OTP exposes that trust directly; it
does not widen it.

## Threat Model

- **Leaked code (e.g. read aloud on a live stream), attacker on another machine.**
  Mitigated by **HttpOnly challenge-cookie binding** (PKCE-style, mirroring the
  OIDC `pkce_verifier`): `start` sets a random, single-use, short-TTL
  `__Secure-ws_otp_chal` cookie (`Secure; HttpOnly; SameSite=Lax`); `verify`
  requires **code + matching cookie**. A code without the binding cookie is
  rejected. The secret lives in an HttpOnly cookie, not frontend JS, so XSS
  cannot read it.
- **Brute force.** 6-digit space + 5-attempt cap per challenge (then locked) +
  10-minute TTL.
- **Email bombing / cost abuse.** Per-email 60-second resend cooldown + daily
  send cap, enforced in-app via the challenge table. **Per-IP rate-limiting is
  delegated to the ingress layer** — an nginx `limit-rps` annotation on the
  identity-api ingress, the same mechanism the public OTLP ingress uses
  (`infra/observability/templates/ingress-otlp-public.yaml`, ADR-0033). The
  application stores no client IP, preserving ADR-0045 minimization. (This
  annotation ships in the deploy wave; no ADR previously governed identity-api
  ingress rate limiting.)
- **Account enumeration.** `start` returns a uniform `202` regardless of whether
  the email is known; and because an unknown email simply creates an account,
  there is inherently no "not found" path.
- **Replay.** Single-use + TTL + `consumed_at`.
- **Session fixation.** Reuses the unchanged `__Secure-ws_session` issuance.
- **Compromise containment.** `POST /v1/auth/logout-all` revokes all of the
  user's sessions except the caller's current device (provider-agnostic — also
  covers Google/Apple sessions). After revocation the attacker cannot re-enter:
  re-authenticating requires the inbox, which they never controlled (contrast a
  leaked password, still valid after logout).
- **Phishing proxy (real-time relay of code + cookie).** Accepted residual —
  only passkeys close it, out of scope here.

## Consequences

**Easier:**

- Sign-in without a third-party IdP; broadens reach for a paid product.
- "One human = one account" for the common case → no split subscription/progress.
- A reusable global session-revocation escape hatch across all providers.

**Harder / flagged:**

- A new PII-adjacent surface (short-lived OTP challenges) and a hard dependency
  on transactional email delivery (ADR-0092) — the feature cannot ship until
  that is live and verified.
- `logout-all` propagates to grid/game only as their ≤30-second whoami-verify
  cache expires (identical to single `logout`; no grid/game code change).
- The Google↔Apple non-merge asymmetry persists until a future full-merge ADR.
