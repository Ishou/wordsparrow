# Priority email-OTP Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give registered accounts a protected daily share of the capped email-OTP send budget, so a new-signup surge (or a throwaway-address DoS) cannot starve returning-user logins.

**Architecture:** Extends the merged #1357 global monthly cap with a nested daily budget (150/day) and a new-account sub-cap (50/day → 100/day registered floor), inside `identity/`. `/start` classifies each request via `UserRepository.findByEmail`, records `account_existed` on the challenge, and gates on it. Hexagonal — domain field, application port + use-case gates, infrastructure adapters, api wiring.

**Tech Stack:** Kotlin/JVM, Ktor, Postgres (CNPG) + Flyway, JUnit 5 + AssertJ + Testcontainers, Konsist.

## Global Constraints

- Governed by **ADR-0093** (this workstream) + ADR-0091 (enumeration relaxation), ADR-0001 (workflow/§4/§6a), ADR-0003 (wire conventions). Run `scripts/adr-context.sh` on every touched path before coding.
- Defaults: `dailyBudget = 150`, `newAccountDailyBudget = 50`. Env overrides `IDENTITY_OTP_DAILY_CAP`, `IDENTITY_OTP_NEW_ACCOUNT_DAILY_CAP`. Mirror #1357's `monthlyCap` code-default + `Wiring` env pattern exactly.
- Migration is **expand-and-contract**: `account_existed` is **nullable** (no backfill; existing rows stay NULL).
- No wire change: `BudgetExhausted → 503` and the OpenAPI `503` on `/v1/auth/email/start` already exist (#1357). Do **not** touch `openapi.yaml` or regenerate types.
- No new dependency. `slf4j-api` is already in `identity/application` (added by #1357) — reuse its logger.
- **Comments:** one-line, non-obvious WHY only. No multi-line comment blocks.
- Conventional commits, single scope, `-s` sign-off. Branch: `feat/identity-otp-priority-budget` (already created).
- Base branch is `main` at or after `a614cd87` (#1357 merged).

---

### Task 1: `V11` migration — `account_existed` column

**Files:**
- Create: `identity/infrastructure/src/main/resources/db/migration/V11__email_otp_challenge_account_existed.sql`

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE identity_email_otp_challenges
    ADD COLUMN account_existed boolean;
```

- [ ] **Step 2: Verify Flyway picks it up** — `./gradlew :identity:infrastructure:test` (the repo's Testcontainers tests run migrations on a fresh Postgres). Expected: migration applies, existing tests still green.

- [ ] **Step 3: Commit** — `feat(identity-infrastructure): add nullable account_existed to otp challenges`

---

### Task 2: Domain — `accountExisted` on `EmailOtpChallenge`

**Files:**
- Modify: `identity/domain/src/main/kotlin/com/bliss/identity/domain/auth/EmailOtpChallenge.kt`
- Test: `identity/domain/src/test/.../auth/EmailOtpChallengeTest.kt` (only if a constructor test already exists; do not add trivial field tests)

**Interfaces:**
- Produces: `EmailOtpChallenge` gains `val accountExisted: Boolean` (non-null in the domain; the DB column is nullable only to tolerate pre-V11 rows).

- [ ] **Step 1: Add the field** — add `val accountExisted: Boolean,` to the data class (place it near `attempts`/`createdAt`; keep `isExpired` unchanged).

- [ ] **Step 2: Fix compile fallout** — every construction site now needs the arg. There are two production sites (the use case, Task 5) and the repo row-mapper (Task 4) plus test fixtures. Update fixtures to pass `accountExisted = false` (or a sensible value) so the module compiles.

- [ ] **Step 3: Build** — `./gradlew :identity:domain:test` green.

- [ ] **Step 4: Commit** — `feat(identity-domain): record account_existed on EmailOtpChallenge`

---

### Task 3: Port + in-memory adapter — `countNewAccountCreatedSince`

**Files:**
- Modify: `identity/application/src/main/kotlin/com/bliss/identity/application/ports/EmailOtpChallengeRepository.kt`
- Modify: `identity/infrastructure/src/testFixtures/kotlin/com/bliss/identity/infrastructure/testdoubles/InMemoryEmailOtpChallengeRepository.kt`
- Test: `identity/infrastructure/src/test/.../InMemoryEmailOtpChallengeRepositoryTest.kt` (if one exists; else cover via the use-case tests in Task 5)

**Interfaces:**
- Produces: `suspend fun countNewAccountCreatedSince(since: Instant): Int` — count of challenges with `accountExisted == false` created at/after `since`.

- [ ] **Step 1: Add to the port**

```kotlin
/** Count of challenges created since [since] classified as new-account (account_existed = false). */
suspend fun countNewAccountCreatedSince(since: Instant): Int
```

- [ ] **Step 2: Implement in the in-memory fake**

```kotlin
override suspend fun countNewAccountCreatedSince(since: Instant): Int =
    challenges.count { it.accountExisted == false && !it.createdAt.isBefore(since) }
```
(Match the fake's existing internal collection name; `it.accountExisted == false` — new rows are always non-null, and the boolean equality reads intent.)

- [ ] **Step 3: Build** — `./gradlew :identity:application:test :identity:infrastructure:test` green.

- [ ] **Step 4: Commit** — `feat(identity-application): add countNewAccountCreatedSince port`

---

### Task 4: Postgres adapter — persist + count `account_existed`

**Files:**
- Modify: `identity/infrastructure/src/main/kotlin/com/bliss/identity/infrastructure/persistence/PostgresEmailOtpChallengeRepository.kt`
- Test: `identity/infrastructure/src/test/.../PostgresEmailOtpChallengeRepositoryTest.kt`

- [ ] **Step 1: Write the failing Testcontainers test** — seed challenges: two `accountExisted = false` and one `= true`, all `createdAt = now`; assert `countNewAccountCreatedSince(now.minusSeconds(1)) == 2`. Also assert a create→`findActiveByEmail` round-trip returns the persisted `accountExisted`.

```kotlin
@Test
fun `counts only new-account challenges since the boundary`() = runTest {
    val now = clock.now()
    repo.create(challenge(email = "a@x.test", accountExisted = false, createdAt = now))
    repo.create(challenge(email = "b@x.test", accountExisted = false, createdAt = now))
    repo.create(challenge(email = "c@x.test", accountExisted = true, createdAt = now))
    assertThat(repo.countNewAccountCreatedSince(now.minusSeconds(1))).isEqualTo(2)
}
```

- [ ] **Step 2: Run — verify it fails** (`countNewAccountCreatedSince` unimplemented / column not written).

- [ ] **Step 3: Implement**
  - Add `account_existed` to the `COLUMNS` constant and the `INSERT ... VALUES (?, …)` placeholder list; bind `challenge.accountExisted` at the new index in `create`.
  - Map it back in the row → `EmailOtpChallenge` reader: `accountExisted = getObject("account_existed", java.lang.Boolean::class.java) == true` (NULL → false, tolerating pre-V11 rows).
  - Add the count SQL + method:

```kotlin
private const val COUNT_NEW_ACCOUNT_SINCE_SQL =
    "SELECT count(*) FROM identity_email_otp_challenges " +
        "WHERE created_at >= ? AND account_existed = false"

override suspend fun countNewAccountCreatedSince(since: Instant): Int =
    // executed on the module's IO dispatcher like the sibling count methods
    withConnection { conn ->
        conn.prepareStatement(COUNT_NEW_ACCOUNT_SINCE_SQL).use { stmt ->
            stmt.setObject(1, since.atUtc())
            stmt.executeQuery().use { rs -> rs.next(); rs.getInt(1) }
        }
    }
```
Match the class's existing connection/dispatcher helper and `atUtc()` conversion (mirror `countAllCreatedSince`).

- [ ] **Step 4: Run — green.** `./gradlew :identity:infrastructure:test`.

- [ ] **Step 5: Commit** — `feat(identity-infrastructure): persist and count account_existed`

---

### Task 5: Use-case gates + classification

**Files:**
- Modify: `identity/application/src/main/kotlin/com/bliss/identity/application/usecases/RequestEmailOtpUseCase.kt`
- Test: `identity/application/src/test/.../usecases/RequestEmailOtpUseCaseTest.kt`

**Interfaces:**
- Consumes: `UserRepository.findByEmail(email): List<User>` (existing port); `EmailOtpChallengeRepository.{countAllCreatedSince, countNewAccountCreatedSince}`.
- Constructor gains `private val users: UserRepository,` and `private val dailyBudget: Int = 150,` `private val newAccountDailyBudget: Int = 50,` (append after `monthlyCap`).

- [ ] **Step 1: Write failing tests** (in-memory fakes: `FakeUserRepository`, `InMemoryEmailOtpChallengeRepository`):
  - `registered email is sent even when the new-account bucket is full` — pre-seed 50 new-account challenges today + a `User` with the email; expect `Sent`.
  - `new email is BudgetExhausted at the new-account cap` — pre-seed 50 new-account challenges today, no user; expect `BudgetExhausted`.
  - `any email is BudgetExhausted at the daily total` — pre-seed 150 challenges today; expect `BudgetExhausted` even for a registered email.
  - `challenge records accountExisted matching the user lookup` — with a user present, assert the persisted challenge has `accountExisted == true`; without, `false`.
  - Keep a regression test that the monthly cap still trips.

- [ ] **Step 2: Run — verify failures** (constructor arity + missing gates).

- [ ] **Step 3: Implement.** After the existing monthly block, before the per-email cooldown:

```kotlin
val dayStart =
    now.atZone(ZoneOffset.UTC).toLocalDate().atStartOfDay(ZoneOffset.UTC).toInstant()
if (challenges.countAllCreatedSince(dayStart) >= dailyBudget) {
    log.warn("otp_daily_budget_exhausted cap={}", dailyBudget)
    return RequestEmailOtpResult.BudgetExhausted
}

val accountExisted = users.findByEmail(email).isNotEmpty()
if (!accountExisted &&
    challenges.countNewAccountCreatedSince(dayStart) >= newAccountDailyBudget
) {
    log.warn("otp_new_account_budget_exhausted cap={}", newAccountDailyBudget)
    return RequestEmailOtpResult.BudgetExhausted
}
```
Then pass `accountExisted = accountExisted` into the `EmailOtpChallenge(...)` constructor. Keep `ZoneOffset` import (already present from #1357's `monthStart`).

- [ ] **Step 4: Run — green.** `./gradlew :identity:application:test`.

- [ ] **Step 5: Commit** — `feat(identity-application): reserve a daily send floor for registered accounts`

---

### Task 6: Wiring — inject `UserRepository` + env caps

**Files:**
- Modify: `identity/api/src/main/kotlin/com/bliss/identity/api/Wiring.kt`

- [ ] **Step 1: Wire it.** In the production factory where `RequestEmailOtpUseCase` is constructed, pass the already-available `UserRepository` instance and read the env caps (mirror the `IDENTITY_OTP_MONTHLY_CAP` line #1357 added):

```kotlin
users = userRepository,
dailyBudget = System.getenv("IDENTITY_OTP_DAILY_CAP")?.toIntOrNull() ?: 150,
newAccountDailyBudget = System.getenv("IDENTITY_OTP_NEW_ACCOUNT_DAILY_CAP")?.toIntOrNull() ?: 50,
```
Use the existing `UserRepository` binding already constructed in `Wiring` (it backs `VerifyEmailOtpUseCase`); do not build a second instance.

- [ ] **Step 2: Build the whole context** — `./gradlew :identity:api:test spotlessCheck`.

- [ ] **Step 3: Full build** — `./gradlew build --parallel --build-cache` green; Konsist arch tests pass (no new cross-layer/cross-context import — `UserRepository` is an application port, already used by the use-case layer).

- [ ] **Step 4: Commit** — `feat(identity-api): wire registered-floor budget env`

---

## Self-Review

- **Spec coverage:** budget hierarchy (Tasks 5/6), classification+recording (Tasks 2/4/5), count method (Tasks 3/4), config (Task 6), migration (Task 1), enumeration posture (ADR-0093, Wave 1). ✓
- **Type consistency:** `accountExisted: Boolean` (domain, non-null) vs `account_existed boolean NULL` (DB, NULL→false on read); `countNewAccountCreatedSince(since: Instant): Int` identical across port/fake/Postgres. ✓
- **Line target:** ~200–250 non-generated LOC. If over 400, invoke the standing cap-override in the PR body (coherent single auth-budget workstream; splitting creates a dependent follow-up per ADR-0001 §6a rule 6). Do **not** split the migration from its use.
