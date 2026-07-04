# ADR-0093: Priority email-OTP send budget by account existence

## Status
Accepted — amends the enumeration-safety stance of [ADR-0091](./0091-email-otp-passwordless-login.md)

## Context

ADR-0091 introduced passwordless email-OTP login; ADR-0092 put delivery on Brevo
under a hard external cap (≤5K/month; app ceiling 4,500/month). PR #1357 enforced
that ceiling as a single global monthly counter over the challenge table. Two
gaps remained, and they share one root cause — all send demand draws from one
undivided pool with no arbitration:

1. **Starvation.** A burst of new-account signups can exhaust the scarce monthly
   budget and leave returning players unable to receive a login code.

2. **Shared-budget DoS** (raised by #1357's §6a review). The global monthly
   counter has no per-actor dimension: an attacker cycling ~4,500 distinct
   throwaway addresses can drive it to the cap and force `503` on
   `POST /v1/auth/email/start` for **every** player until the next UTC month —
   a full denial of the email-login path introduced by a cost-control feature.
   ADR-0091's per-actor mitigations (60s per-email cooldown, per-email daily cap,
   per-IP ingress limit) do not cover a distributed, single-send-per-address
   attack.

The maintainer chose to arbitrate by **account existence**: give already-
registered accounts a protected share of the budget, accepting the enumeration
consequence (below) over the alternative of prioritising by returning-device
signal (which would misclassify a registered user on a new device as "new,"
defeating the goal for the very population it protects).

## Decision

### Nested daily budget with a registered floor

Layer a daily budget, and a new-account sub-budget within it, under #1357's
monthly cap:

```
monthly   4,500        (#1357, unchanged)
  └─ daily      150     (≈ 4,500 / 30; bounds one-day burn)
       └─ new-account  50/day   (max sends/day to non-registered emails)
          ⇒ registered floor = 100/day, always available
```

At `start`, the request is classified via the existing
`UserRepository.findByEmail` port: **registered** if an `identity_users` row
exists for the verified email, else **new**. Gates, in order (budget gates before
the per-email throttles, matching #1357):

- monthly total ≥ 4,500 → `503`
- daily total ≥ 150 → `503`
- **new** email and new-account daily count ≥ 50 → `503`
- (registered emails are never subject to the new-account sub-cap)
- then the unchanged per-email 60s cooldown and daily cap → `429`

A throwaway-address flood is thus capped at 50 sends/day and can never consume
the 100/day floor reserved for returning users — arbitrating starvation and
converting the shared-budget DoS from "login down for everyone" into "new signups
throttled; returning logins unaffected."

### Classification recorded on the challenge

`EmailOtpChallenge` gains `accountExisted: Boolean`, persisted via a nullable
`account_existed` column (`V11`, expand-and-contract). The new-account count is
`countNewAccountCreatedSince(since)` over `account_existed = false`, keeping the
challenge repository self-contained (the in-memory adapter filters a stored
boolean; no cross-table join) and the classification point-in-time-correct.

### Configuration

Code defaults, env-overridable (mirrors #1357): `IDENTITY_OTP_DAILY_CAP` (150),
`IDENTITY_OTP_NEW_ACCOUNT_DAILY_CAP` (50). No wire change — `BudgetExhausted →
503` and the OpenAPI `503` on `/v1/auth/email/start` already exist.

## Threat Model

Required by CLAUDE.md (auth-path change). This ADR both *adds* a mitigation and
*relaxes* an existing property:

- **Mitigated — shared-budget DoS (from #1357).** The new-account sub-cap bounds
  what unauthenticated/new demand can consume to 50/day, guaranteeing the 100/day
  registered floor. An attacker can no longer deny email login to returning users
  by burning throwaway addresses; they can at most exhaust the new-signup lane.

- **Relaxed — account enumeration (ADR-0091).** ADR-0091 guaranteed `start`
  returns a uniform `202` regardless of whether the email is known. This ADR
  breaks that **only in the degraded (new-bucket-exhausted) state**: a *new*
  email then receives `503` while a *registered* email still receives `202`,
  making `202`-vs-`503` an account-existence oracle. Accepted because:
  - Blast radius is the email-OTP fallback only; Google/Apple OIDC is unaffected.
  - The signal exists only while the new-account daily bucket is drained, not in
    normal operation.
  - `BudgetExhausted → 503` is a symptom ADR-0032 already alerts on, so sustained
    exhaustion (the window in which the oracle exists) pages the maintainer.
  - Caps are env-tunable, so a false-positive lockout clears without a deploy.
  - The rejected alternative (prioritise by returning-device cookie) preserves
    enumeration-safety but misclassifies registered users on new devices, failing
    the fairness goal.

- **Unchanged.** Challenge-cookie binding, brute-force cap, replay, session
  fixation, and `logout-all` containment are all as in ADR-0091; the per-email
  cooldown/daily-cap and per-IP ingress limit are untouched.

## Consequences

**Easier:**
- Returning-user logins survive both a new-signup surge and the #1357
  shared-budget DoS.
- Budget policy is three env-tunable integers; no deploy to re-balance.

**Harder / flagged:**
- A bounded account-enumeration oracle exists in the degraded state (above) —
  a deliberate, alerted, reversible relaxation of ADR-0091.
- Each `start` adds one `findByEmail` lookup; non-registered requests add the
  new-account count query. Negligible at the ≤150/day scale.
- `account_existed` is `NULL` for challenges created before `V11`; the
  new-account count treats `NULL` as not-counted (historical rows are expired).
