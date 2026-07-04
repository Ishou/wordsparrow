# Priority email-OTP send budget by account existence — Design

**Date:** 2026-07-04
**Context:** `identity/`
**Status:** Design (pending ADR-0093)
**Builds on:** PR #1357 (global monthly OTP send budget), ADR-0091 (email-OTP
passwordless login), ADR-0092 (Brevo transactional email).

## Problem

WordSparrow's transactional email runs on a hard external cap (Brevo ≤5K/month;
app ceiling 4,500/month, enforced by #1357 as a global monthly counter). Two
gaps remain:

1. **Fairness / starvation.** A burst of new-account signups can consume the
   scarce monthly budget and leave returning players unable to receive a login
   code. Under a capped provider, new-account demand and returning-user login
   demand compete for the same pool with no arbitration.

2. **Shared-budget DoS (surfaced by #1357's §6a review).** The global monthly
   counter is a single total across all callers with no per-actor dimension. An
   attacker cycling ~4,500 distinct throwaway addresses can drive the counter to
   the cap and force `503` on `POST /v1/auth/email/start` for **every** player
   until the next UTC month — a full denial of the email-login path introduced
   by a cost-control feature.

Both reduce to the same fix: **stop treating all send demand as one undivided
pool, and give returning (registered) accounts a protected share.**

## Decision summary

Introduce a **nested daily budget** with a reserved floor for registered
accounts, layered under #1357's monthly cap:

```
monthly   4,500        (#1357, unchanged — hard ceiling, protects the Brevo bill)
  └─ daily      150     (new — ≈ 4,500 / 30; smooths spend, bounds one-day burn)
       └─ new-account  50/day   (new — max sends/day to non-registered emails)
          ⇒ registered floor = 150 − 50 = 100/day, always available
```

`/start` classifies each request as **registered** (an `identity_users` row
already exists for the verified email) or **new** (no such row), records the
classification on the challenge, and applies:

- **New email:** blocked (`503`) if the new-account daily count ≥ 50, or the
  daily total ≥ 150, or the monthly total ≥ 4,500.
- **Registered email:** blocked (`503`) only at the daily total (150) or monthly
  (4,500). Never blocked by the new-account sub-cap.

So a throwaway-address flood (all classified "new") is capped at 50 sends/day and
can never consume the 100/day floor reserved for returning users. This
simultaneously arbitrates fairness (gap 1) and converts the shared-budget DoS
(gap 2) from "email-login down for everyone" into "new signups throttled;
returning logins unaffected."

All three limits are env-tunable and raised without a code change when the Brevo
plan grows.

## Enumeration trade-off (load-bearing — amends ADR-0091)

ADR-0091 made `/start` **enumeration-safe**: the response is identical whether or
not an account exists, so an attacker cannot probe which emails are registered.
This design **partially relaxes** that property:

- During **normal operation** (new-account bucket not exhausted), every request
  still returns `202` regardless of account existence — no signal.
- In the **degraded state** (new-account daily bucket drained), a **new** email
  gets `503` while a **registered** email still gets `202`. Observing `202` vs
  `503` reveals whether an account exists — a bounded enumeration oracle.

This is an **accepted** trade-off, recorded in ADR-0093, justified by:

- **Blast radius is the email-OTP fallback only.** Google/Apple OIDC sign-in is
  unaffected; the oracle exists only for the email path and only while the
  new-bucket is exhausted.
- **The alternative (prioritize by returning-device, not email) was rejected**
  by the maintainer: it preserves enumeration-safety but treats a registered
  user on a brand-new device as "new," defeating the fairness goal for exactly
  the returning-user population it aims to protect.
- **Backstop:** `BudgetExhausted → 503` is a symptom ADR-0032 already alerts on
  (5xx via Gmail SMTP), so sustained exhaustion pages the maintainer.
- **Recovery:** the caps are env-tunable, so a false-positive lockout is cleared
  without a deploy.

## Mechanism

### Classification & recording

`/start` calls the existing `UserRepository.findByEmail(email)` port (already
used by `VerifyEmailOtpUseCase`) and records the boolean result on the challenge:

- `EmailOtpChallenge` gains an `accountExisted: Boolean` field.
- Migration `V11__email_otp_challenge_account_existed.sql` adds a **nullable**
  `account_existed boolean` column (expand-and-contract; existing rows stay
  `NULL`, new rows always set it).
- `PostgresEmailOtpChallengeRepository` persists and reads the column.

Recording at creation (rather than a live `NOT EXISTS` join) keeps the challenge
repository self-contained — the `InMemoryEmailOtpChallengeRepository` fake can
implement the new count by filtering a stored boolean, honouring the
"mock only at external boundaries / use in-memory impls" rule — and gives
point-in-time-correct semantics (an email that registers later in the day does
not retroactively change past classifications).

### New count method

`EmailOtpChallengeRepository` gains:

```kotlin
/** Count of challenges created since [since] whose account_existed = false. */
suspend fun countNewAccountCreatedSince(since: Instant): Int
```

- Postgres: `SELECT count(*) FROM identity_email_otp_challenges
  WHERE created_at >= ? AND account_existed = false`.
- In-memory fake: `challenges.count { it.accountExisted == false && !it.createdAt.isBefore(since) }`.

The daily **total** reuses #1357's existing `countAllCreatedSince(since)` (passing
the UTC day-start), so no separate method is needed for it.

### Use-case flow (`RequestEmailOtpUseCase.execute`)

Order of gates (budget gates before per-email throttles, matching #1357):

1. `monthStart` → `countAllCreatedSince` ≥ `monthlyCap` (4,500) → `BudgetExhausted`
   *(#1357, unchanged)*
2. `dayStart` → `countAllCreatedSince` ≥ `dailyBudget` (150) → `BudgetExhausted`
   *(new; WARN `otp_daily_budget_exhausted`)*
3. `registered = users.findByEmail(email).isNotEmpty()`
4. if `!registered` and `countNewAccountCreatedSince(dayStart)` ≥
   `newAccountDailyBudget` (50) → `BudgetExhausted`
   *(new; WARN `otp_new_account_budget_exhausted`)*
5. per-email cooldown (60s) → `RateLimited` *(unchanged)*
6. per-email daily cap (8/day) → `RateLimited` *(unchanged)*
7. create challenge (with `accountExisted = registered`) + send

`dayStart` = `now.atZone(UTC).toLocalDate().atStartOfDay(UTC).toInstant()`,
mirroring #1357's `monthStart` construction.

The `countNewAccountCreatedSince` query runs only for non-registered emails
(registered emails short-circuit at step 3), so registered logins add just the
one `findByEmail` lookup.

### Configuration

Mirror #1357's pattern — code defaults, env overrides read in `Wiring`:

- `IDENTITY_OTP_DAILY_CAP` (default **150**) → `dailyBudget`
- `IDENTITY_OTP_NEW_ACCOUNT_DAILY_CAP` (default **50**) → `newAccountDailyBudget`

No new route or response code: `BudgetExhausted → 503` is already mapped by #1357,
and the OpenAPI `503` response on `/v1/auth/email/start` already exists.

## What this does NOT change

- No new bounded context, dependency, or runtime language.
- No change to the wire contract (`openapi.yaml` already documents `503`).
- No change to `VerifyEmailOtpUseCase`, the cookie-binding, or the OIDC paths.
- The per-email cooldown/daily-cap and per-IP ingress limit are untouched.

## Testing

- **Application (use-case, in-memory fakes):**
  - registered email is sent even when new-account count is at the 50 cap
    (floor protected).
  - new email → `BudgetExhausted` when new-account count ≥ 50.
  - any email → `BudgetExhausted` when daily total ≥ 150.
  - monthly cap still trips (regression on #1357).
  - the challenge is persisted with `accountExisted` matching the lookup.
- **Infrastructure (Postgres, Testcontainers):**
  - `countNewAccountCreatedSince` counts only `account_existed = false` rows since
    the boundary; seed registered + unregistered challenges and assert.
  - round-trip persists/reads `account_existed`.
  - fixture emails use the prod writer's casing (lowercased) so the count matches
    prod behaviour.

## Rollout

Two waves, sequential (ADR merges before implementation per ADR-0001 §7):

| Wave | PR | Contents |
|------|----|----------|
| 1 | `docs(adr-0093)` | ADR-0093 (decision + threat model) + `docs/adr/INDEX.md` path bindings + this spec + the plan file |
| 2 | `feat(identity-application)` | migration + domain field + port method + Postgres/in-memory impls + use-case gates + Wiring env + tests; spec linked in PR body |

Wave 2 is expected to land near the 400-line soft target; if it exceeds, invoke
the standing cap-override with the "one coherent auth-budget workstream, splitting
creates a dependent follow-up" justification (ADR-0001 §6a rule 6, 2026-05-25
amendment).
