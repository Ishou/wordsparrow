# ADR-0092: Brevo as the transactional email provider

## Status
Accepted — enables ADR-0091 (passwordless email-OTP login). Relates to
ADR-0007 (runtime config from env, fail-fast), ADR-0009 (secret bootstrap),
ADR-0032 (Gmail SMTP for ops alerts — **not** a transactional path).

## Context

ADR-0091 requires delivering one-time codes by email. The repository has **no
transactional email path**: there is no mail-sending code in any service, and
no email-provider dependency. ADR-0032's Gmail SMTP is wired into the
observability/alerting layer for ops alerts — it is not callable from
`identity-api`, and Gmail SMTP is not fit for transactional volume or
deliverability.

Delivering OTPs means a provider processes player email addresses. For a French
EURL with a RGPD-minimal identity context (ADR-0045), an EU-hosted provider
keeps the data-transfer story clean (no reliance on US transfer frameworks).
Deliverability at our (low, transactional-only) volume is primarily a function
of domain authentication (SPF/DKIM/DMARC), not provider brand.

## Decision

- **Provider: Brevo** — French company, EU-hosted by default (FR/DE data
  centres, DPA available), mature and well-documented, free tier covering
  current volume. This is a **paid third-party service**; the maintainer
  approved it and provisioned a Starter plan on 2026-07-03 (satisfies the
  CLAUDE.md "paid third-party service needs explicit approval" gate).
- **Swappable behind a port.** `identity-api` depends only on an `EmailSender`
  port (`identity/application`); `BrevoEmailSender` (`identity/infrastructure`)
  is the adapter, calling Brevo's `POST /v3/smtp/email` via the Ktor HTTP client
  (no vendor SDK). Scaleway TEM (more sovereign) and Postmark (deliverability
  leader) remain drop-in alternatives if ever needed.
- **Domain authentication is the real deliverability lever.** SPF, DKIM, and
  DMARC records on a dedicated sending subdomain (`no-reply@wordsparrow.io`),
  configured out-of-band in the Brevo dashboard + Cloudflare DNS.
- **Secret handling.** `BREVO_API_KEY` is an externally-issued outbound key; it
  rides the existing bootstrapped `envFromSecret` Secret (no chart template
  change), read via `System.getenv` and required fail-fast at boot **only when
  the email-OTP flag is on** (`IDENTITY_EMAIL_OTP_ENABLED`).
- **Transactional purpose only.** OTP codes now; receipts / new-sign-in alerts
  later. Not used for marketing, profiling, or analytics (RGPD purpose
  limitation).

## Consequences

**Easier:**

- ADR-0091 can deliver codes; a reusable `EmailSender` serves future
  transactional mail (receipts, sign-in alerts).
- EU data residency keeps the RGPD posture consistent with the rest of identity.

**Harder / flagged:**

- A recurring paid dependency and an external key to rotate (Category A secret,
  see `docs/secrets.md`).
- Deliverability now depends on correct SPF/DKIM/DMARC setup — a misconfigured
  domain lands OTPs in spam and silently breaks login; the sending domain must
  be verified before the OTP flag flips bright.
