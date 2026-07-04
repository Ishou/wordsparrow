# ADR-0094: Consumer-law conformity for the paid subscription

## Status

Proposed — governance umbrella for the CGV conformity effort. Amends
ADR-0078 and ADR-0082 (billing PII posture). Relates to ADR-0092 (Brevo
transactional email), ADR-0093 (identity OTP send budget), ADR-0033
(frontend OTel ingest), ADR-0025 (analytics / RGPD posture).

## Context

ISHO IT (EURL, assujettie TVA) sells a paid subscription to consumers.
French consumer and tax law imposes obligations the current system does
not meet, and the authoritative specification is the **CGV v1.0**
(2026-07-04). A survey of the code established:

- **Billing PII posture** (ADR-0078/0082): the payment provider (Mollie)
  is system-of-record for PII; billing stores only a lean entitlement
  row (`user_id, tier, status, period_end`). ADR-0082 already permits
  retaining the player email for legal invoicing. Billing **sends no
  email** and has no mail path.
- **Résiliation already exists** end-to-end (`AbonnementSection.tsx` →
  `POST /v1/subscription/cancel` → `PENDING_CANCELLATION`, access kept
  until `period_end`) — this already meets Art. 14.1's résiliation en
  ligne (art. L215-1-1).
- **Consent**: nothing captures the CGV acceptance or the Art. 13
  rétractation-waiver at checkout.
- **Cookies**: Matomo runs cookieless (`disableCookies`, DoNotTrack, no
  cross-site); OTel is first-party performance telemetry. No banner.
- **Renewal** is Mollie-automatic; billing only reacts to webhooks. The
  billing worker exists but is **unwired** (no CronJob/chart).
- **Prices**: monthly 2 €, annual 20 € TTC — both **below 25 €**.

## Decision

1. **Extend the billing data posture (amends ADR-0078/0082).** Billing
   MAY persist **consent records** — CGV acceptance and the Art. 13
   rétractation-waiver, each with a timestamp and the accepted CGV
   version — and MAY **send transactional email**. It does **not** collect
   or store the customer's name/address for all subscribers, and does
   **not** store invoices (see §5–6). This is the minimum extension for
   contract formation and durable-medium confirmation.

2. **Billing sends its own transactional email via a dedicated Brevo
   adapter** in `billing/infrastructure`, mirroring identity's
   `BrevoEmailSender` (no cross-context import). These messages are
   legally mandated (contract confirmation/receipt, Chatel notice,
   price/CGV-change notice) and **MUST NOT be subject to any
   send-budget/cost ceiling** — unlike identity's OTP budget (ADR-0093).
   A separate sender identity/config keeps OTP volume from ever starving
   them at the account level.

3. **The Chatel pre-renewal notice (art. L215-1) is scoped to the annual
   offer.** The "au plus tôt 3 mois, au plus tard 1 mois avant le terme"
   window is impossible for a 1-month term; the monthly offer is
   protected by the at-will résiliation en ligne instead. Price-change
   (Art. 5) and CGV-change (Art. 17) notices apply to **both** cadences,
   on durable medium, at least one month before the échéance.

4. **No cookie consent banner.** The audience measurement (Matomo) is
   cookieless and meets the CNIL exemption (anonymised IP, no cross-site,
   DoNotTrack honoured); OTel is first-party performance telemetry. The
   compliant artifact is a documented cookie policy, not a banner. This
   decision is **conditional on the tracker set**: adding any non-exempt
   or advertising tracker re-opens it and requires a consent mechanism.

5. **Consumers receive a receipt, not a systematic facture.** Both offers
   are under 25 € TTC, so a nominative facture is required only **on
   request** (never systematically; a facture may never be refused when
   asked). Day-to-day, the consumer receives a **receipt on durable
   medium** — the confirmation/renewal email — which must carry seller
   identity (ISHO IT, SIRET, TVA), amount, VAT, and date. **Tripwire:**
   pricing any offer **above 25 € TTC** re-triggers a systematic-facture
   obligation and this decision must be revisited.

6. **Invoicing and e-reporting run through Qonto, not Mollie.** Qonto
   (ISHO IT's bank) is a DGFiP-registered *Plateforme Agréée*; Mollie is
   not. Formal factures are issued **on request** via Qonto's
   client-invoices API (on-demand client creation, automatic Factur-X
   numbering) — so the number of Qonto "clients" tracks facture requests,
   not the subscriber count. B2C **e-reporting** (from Sept 2027) is
   **daily-aggregated** turnover + VAT transmitted to the DGFiP via the
   PA, driven from accounting/settlement data — an accountant-coordinated
   process, not per-charge application code. The 10-year retention of
   accounting documents (C. com. L123-22) is a merchant bookkeeping duty
   (accountant / Qonto), not a consumer-facing archive we build.

## Consequences

- **Easier:** contract formation + durable-medium confirmation become
  buildable; the existing résiliation flow gains its confirmation email;
  the 2026-27 e-invoicing reform is future-proofed via a registered PA;
  no bespoke invoicing subsystem, numbering series, or 10-year archive to
  own.
- **New / harder:** billing gains a Brevo adapter, consent storage, and a
  scheduler — which requires **wiring the currently-unwired billing
  worker** into a CronJob/chart. A small on-request Qonto facture adapter
  follows later.
- **Deferred to the maintainer / accountant:** the e-reporting operator
  and the authoritative 10-year record location; a legal skim of the
  confirmation-email mentions; Qonto API enablement.
- **Follow-on workstreams (each its own PR, gated on this ADR):**
  (3) checkout consent capture — schema-first (`CheckoutSessionRequest`
  gains consent fields) + double-clic récap + two checkboxes;
  (4) confirmation/receipt email + billing Brevo adapter;
  (5) résiliation confirmation email;
  (6) Chatel / price-change / CGV-change scheduler;
  (7) on-request facture via Qonto (low priority).
