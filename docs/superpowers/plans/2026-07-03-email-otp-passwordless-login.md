# Passwordless Email-OTP Login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution model (this repo):** ordered **PR waves** (ADR-0001; see the "plan-as-PR-waves" convention). Each PR is one workstream, ≤400 diff lines (generated code excluded; cap-override allowed with justification). Every PR merges on green CI + §6a LGTM before the next in its wave starts. A wave is fully merged before the next wave begins, because later waves consume the earlier waves' committed signatures.

**Goal:** Add a passwordless email one-time-code (OTP) sign-in path to the `identity/` context, alongside Google/Apple OIDC, with email as a first-class login provider.

**Architecture:** Hexagonal Kotlin/Ktor `identity/` service (domain → application ports → infrastructure adapters → api routes) + React/TS frontend. OTP challenge stored server-side (hashed code + hashed cookie-binding secret, TTL, attempt cap); session minted exactly like the OIDC completion path; email delivered via a `EmailSender` port with a **Brevo** adapter. Frontend adds a two-step `/connexion` screen (email → code) and a "sign out everywhere" action, both behind a feature flag.

**Tech Stack:** Kotlin 2.3 + Ktor on JDK 21, Postgres (CNPG) + Flyway (per-context history table `flyway_schema_history_identity`), raw JDBC, kotest-property + assertk + JUnit 5 + Testcontainers; Vite + React 19 + TS + Panda CSS + Ark UI + TanStack Router, vitest + Playwright; OpenAPI-first contract (openapi-typescript codegen); Helm chart at `identity/api/deploy/chart/`.

**Spec:** `docs/superpowers/specs/2026-07-03-email-otp-passwordless-login-design.md` (read it first).

## Global Constraints

- **Branch/worktree:** `feat/email-auth` at `/Users/isho/IdeaProjects/bliss-email-auth` (off the true `origin/main`). Never commit in the main checkout.
- **DCO:** every commit `git commit -s`. Conventional commits, bounded-context scope: `feat(identity-domain): …`, `feat(identity-api): …`, `chore(api-identity): …` (types: feat/fix/chore/refactor/test/docs only; single scope; body ≤100 cols; no PascalCase first word).
- **ADR pre-read:** before code in any wave, run `scripts/adr-context.sh <paths>` and read matching ADRs. Binding ADRs here: **0044** (identity context, session cookie), **0045**/**0082** (data minimization / email retention), **0003** (schema-first), **0007** (env config, fail-fast), **0009** (deploy/secrets bootstrap), **0050** (a11y WCAG AA).
- **Hexagonal boundaries (Konsist, enforced):** `domain/` imports nothing from application/infrastructure, no frameworks, no vendor SDKs (`java.security.SecureRandom` + `java.util.Base64` + `java.security.MessageDigest` are allowed in domain); `application/` imports only `domain`; `api.dto` package imports neither `com.bliss.identity.domain` nor `io.ktor`.
- **Comments:** one line max, non-obvious *why* only. No multi-line `//`/`#`/docstring blocks (§6a flags them). Pre-empt at write-time.
- **Copy:** inline French, **tutoiement** ("tu"), typographic apostrophes `’`, no i18n catalog. **a11y:** WCAG AA; form errors `role="alert"`; transient status via the shared `Announcer` (`say(...)`), never `aria-live` on a ticking node.
- **Migrations:** Flyway is immutable — never edit an applied `V*.sql`; next file is `V9__…`. Expand-and-contract.
- **Secrets:** never in code; `BREVO_API_KEY` injected at runtime via the bootstrapped `envFromSecret` Secret.
- **Feature flags ship dark, release bright, carry an expiry comment:** backend `IDENTITY_EMAIL_OTP_ENABLED` (default-OFF), frontend `VITE_FEATURE_EMAIL_AUTH` (default-off).

---

## File-structure map

**New — domain (`identity/domain/src/main/kotlin/com/bliss/identity/domain/`):**
- `auth/OtpCode.kt` — 6-digit numeric value type (`generate(SecureRandom)`, `of(raw)`).
- `auth/ChallengeSecret.kt` — random url-safe binding secret (mirrors `State`).
- `auth/EmailOtpChallenge.kt` — challenge entity + invariants (TTL, attempt cap, consumed).
- `auth/ChallengeId.kt` — UUID id value type.
- `user/EmailAddress.kt` — normalized (trim+lowercase) + shape-validated email value type.
- `provider/Provider.kt` — **modify:** add `EMAIL` enum constant (`toWire() = "email"`).

**New — application (`identity/application/src/main/kotlin/com/bliss/identity/application/`):**
- `ports/EmailOtpChallengeRepository.kt`, `ports/EmailSender.kt`, `ports/TokenHasher.kt`.
- `ports/RandomFactory.kt` — **modify:** add `newOtpCode(): OtpCode`, `newChallengeSecret(): ChallengeSecret`.
- `ports/UserRepository.kt` — **modify:** add `findByEmail(email): List<User>`.
- `ports/SessionRepository.kt` — **modify:** add `revokeAllForUserExcept(userId, keep, at)`.
- `usecases/RequestEmailOtpUseCase.kt`, `usecases/VerifyEmailOtpUseCase.kt`, `usecases/VerifyEmailOtpError.kt`, `usecases/LogoutAllUseCase.kt`.

**New — infrastructure (`identity/infrastructure/src/main/kotlin/com/bliss/identity/infrastructure/`):**
- `persistence/PostgresEmailOtpChallengeRepository.kt`; `persistence/InMemoryEmailOtpChallengeRepository.kt`.
- `email/BrevoEmailSender.kt`; `auth/Sha256TokenHasher.kt`.
- `auth/SecureRandomFactory.kt` — **modify:** implement the two new methods.
- `persistence/PostgresUserRepository.kt` — **modify:** implement `findByEmail`; `PostgresSessionRepository.kt` — **modify:** implement `revokeAllForUserExcept`.
- `config/IdentityApiConfig.kt` — **modify:** add nullable `BrevoConfig`.
- `db/migration/V9__user_providers_add_email.sql`, `db/migration/V10__email_otp_challenges.sql`.
- test fixtures — **modify:** `FixedRandomFactory`, add `InMemory*` seams.

**New — api (`identity/api/src/main/kotlin/com/bliss/identity/api/`):**
- `routes/EmailOtpRoute.kt` (start + verify), `routes/LogoutAllRoute.kt`.
- `dto/EmailStartRequest.kt`, `dto/EmailVerifyRequest.kt` (pure wire types).
- `auth/ChallengeCookies.kt`.
- `Wiring.kt` + `Module.kt` — **modify:** construct + mount, behind the flag.

**Modify — contract & frontend:**
- `identity/api/openapi.yaml` (+ regenerated `frontend/src/infrastructure/api/identity/types.ts`).
- `frontend/src/ui/components/primitives/OtpCodeInput.tsx` (new); `application/auth/AuthClient.ts` + `infrastructure/auth/HttpAuthClient.ts`; `ui/routes/connexion.tsx` (new) + `ui/v2/ConnexionScreen.tsx` (new); `ui/router.ts`, `main.tsx`, `vite-env.d.ts`; `ui/v2/CompteScreen.tsx`.

**Modify — governance/deploy:**
- `docs/adr/0091-email-otp-passwordless-login.md`, `docs/adr/0092-brevo-transactional-email.md`, `docs/adr/INDEX.md`, `docs/secrets.md`.
- `identity/api/deploy/chart/values.yaml` (+ CI/deploy).

---

# WAVE 1 — Governance & contract (docs + schema; merge first)

## Task 1.1: ADR-0091 — email-OTP passwordless login

**Files:** Create `docs/adr/0091-email-otp-passwordless-login.md`; Modify `docs/adr/INDEX.md`.

- [ ] **Step 1:** Write `docs/adr/0091-email-otp-passwordless-login.md` mirroring the ADR-0082 structure (`# ADR-0091: …` → `## Status` (Accepted; *Relates to* ADR-0044/0045/0082) → `## Context` → `## Decision` → `## Threat Model` → `## Consequences`). Content is the spec's **Decisions** + **Threat model** sections: OTP-over-magic-link; email as first-class provider (`provider='email'`); Option-B verified-email resolution (link-exists → same account; exactly-one email match → attach link; zero/ambiguous → new account); HttpOnly challenge-cookie binding (PKCE-style); global session revocation (note the ≤30 s whoami-cache propagation delay in Consequences); per-email cooldown+cap in-app, **per-IP rate-limit delegated to ingress-nginx (no IP stored — preserves ADR-0045 minimization)**; phishing-proxy residual accepted. Explicitly extends the provider set beyond `{google,apple}`.
- [ ] **Step 2:** Add INDEX.md rows (registry-coherence requires INDEX touched in the same PR). In the fenced block, add:

```
ADR-0091  identity/domain/**/auth/**                 Email-OTP domain: OtpCode, EmailOtpChallenge, ChallengeSecret; TTL + attempt-cap invariants
ADR-0091  identity/application/**/usecases/RequestEmailOtpUseCase.kt  Start: enumeration-safe 202, per-email cooldown+daily cap, hashed code + hashed binding secret
ADR-0091  identity/application/**/usecases/VerifyEmailOtpUseCase.kt   Verify: challenge-cookie binding check, Option-B account resolution, session mint
ADR-0091  identity/api/**/auth/ChallengeCookies.kt    __Secure- HttpOnly short-TTL OTP challenge cookie (binding)
ADR-0091  identity/api/**/routes/EmailOtpRoute.kt     POST /v1/auth/email/start + /verify
ADR-0091  identity/api/**/routes/LogoutAllRoute.kt    POST /v1/auth/logout-all (revoke all sessions except caller)
# ADR-0091: passwordless email login; email = first-class provider; verified-email collision = same account (Option B); full cross-provider merge deferred
```

- [ ] **Step 3: Verify** `bash scripts/adr-context.sh identity/api/routes/EmailOtpRoute.kt` prints ADR-0091's body. Expected: the ADR text appears.
- [ ] **Step 4: Commit** — `git commit -s -m "docs(adr): ADR-0091 passwordless email-OTP login"`

**DoD:** ADR + INDEX rows land together; `registry-coherence` passes; §6a LGTM. (Human-authored ADR PR merges on standard §6a.)

## Task 1.2: ADR-0092 — Brevo transactional email provider

**Files:** Create `docs/adr/0092-brevo-transactional-email.md`; Modify `docs/adr/INDEX.md`, `docs/secrets.md`.

- [ ] **Step 1:** Write the ADR: **Decision** = Brevo (French, EU-hosted, DPA) for transactional OTP delivery; `EmailSender` port keeps it swappable; **paid third-party service — maintainer approval on record (2026-07-03), Brevo Starter plan provisioned**; RGPD basis (transactional, not marketing); **domain authentication** (SPF/DKIM/DMARC on a dedicated sending subdomain, e.g. `no-reply@wordsparrow.io`) as the real deliverability lever; `BREVO_API_KEY` injected via the bootstrapped `envFromSecret` Secret, read fail-fast at boot (ADR-0007) only when the OTP flag is on.
- [ ] **Step 2:** INDEX.md rows:

```
ADR-0092  identity/infrastructure/**/email/BrevoEmailSender.kt   Brevo transactional adapter (Ktor HttpClient → Brevo v3 smtp/email)
ADR-0092  identity/api/**/config/IdentityApiConfig.kt            Reads BREVO_API_KEY (nullable; required only when IDENTITY_EMAIL_OTP_ENABLED)
# ADR-0092: paid service (maintainer-approved 2026-07-03); EU data residency; SPF/DKIM/DMARC domain-auth; swappable behind EmailSender port
```

- [ ] **Step 3:** Add a `docs/secrets.md` Inventory row (Category **A**, externally-issued): `BREVO_API_KEY` | `identity` | A | `kubectl create secret … envFromSecret bag` | "mint a new key in the Brevo dashboard, recreate the k8s secret".
- [ ] **Step 4: Commit** — `git commit -s -m "docs(adr): ADR-0092 Brevo transactional email provider"`

**DoD:** ADR + INDEX + secrets row land together; §6a LGTM.

## Task 1.3: Schema-only contract PR (ADR-0003)

**Files:** Modify `identity/api/openapi.yaml`; regenerate `frontend/src/infrastructure/api/identity/types.ts`.

**Interfaces produced (wire contract later waves consume):**
- `POST /v1/auth/email/start` — body `EmailStartRequest {email: string}` → `202` (empty) | `400` ProblemDetails (malformed) | `429` ProblemDetails (rate-limited). Unauthenticated. Sets `__Secure-ws_otp_chal` cookie (documented via a `Set-Cookie` response header note).
- `POST /v1/auth/email/verify` — body `EmailVerifyRequest {email: string, code: string}` + `__Secure-ws_otp_chal` cookie → `200` `WhoAmIResponse` + `Set-Cookie: __Secure-ws_session` | `400`/`401` (bad/expired/locked code) | `429`.
- `POST /v1/auth/logout-all` — `security: [sessionCookie: []]` → `204` | `401`. (No cookie clear — caller stays signed in.)

- [ ] **Step 1:** In `openapi.yaml` `paths:`, insert `email/start` + `email/verify` after `/v1/auth/apple/callback` (before `whoami`), and `logout-all` right after `/v1/auth/logout`. Mirror `whoami` (auth GET) and `logout` (auth POST 204) verbatim for structure; reuse `#/components/responses/ProblemDetails` for every error — do not invent new error shapes. `verify` `200` returns `#/components/schemas/WhoAmIResponse`.
- [ ] **Step 2:** Under `components/schemas` (before `ProblemDetails`), add `EmailStartRequest` (`required: [email]`, `email: {type: string, format: email, maxLength: 254}`) and `EmailVerifyRequest` (`required: [email, code]`, `code: {type: string, pattern: '^[0-9]{6}$'}`).
- [ ] **Step 3: Lint** — `npx @stoplight/spectral-cli lint identity/api/openapi.yaml` (or the repo's `openapi-lint` invocation). Expected: no errors.
- [ ] **Step 4: Regenerate types** — `cd frontend && pnpm api:generate`. Confirm `src/infrastructure/api/identity/types.ts` now contains the three new paths.
- [ ] **Step 5: Verify no drift** — `cd frontend && pnpm api:check`. Expected: exit 0 (clean diff).
- [ ] **Step 6: Commit** — `git commit -s -m "feat(identity-api): email-OTP + logout-all endpoints (schema-only, ADR-0003)"` including the regenerated `types.ts` (generated; excluded from the line cap).

**DoD:** `openapi-lint` + `openapi-typescript-drift` green; §6a LGTM. No producer/consumer code in this PR.

---

# WAVE 2 — Identity domain + application (behind dark flag; no wiring yet)

> All Wave-2 PRs are pure domain/application with unit tests (in-memory fakes). TDD: failing test → run-red → implement → run-green → commit. Konsist boundaries apply.

## Task 2.1: `OtpCode` + `ChallengeSecret` + `EmailAddress` value types

**Files:** Create `identity/domain/src/main/kotlin/com/bliss/identity/domain/auth/OtpCode.kt`, `…/auth/ChallengeSecret.kt`, `…/user/EmailAddress.kt`; Tests under `identity/domain/src/test/kotlin/com/bliss/identity/domain/{auth,user}/`.

**Interfaces produced:** `OtpCode.of(String)`, `OtpCode.generate(SecureRandom)`, `OtpCode.value`; `ChallengeSecret.generate(SecureRandom)`, `.value`; `EmailAddress.of(String).value` (normalized).

- [ ] **Step 1: Failing test** `OtpCodeTest.kt`:

```kotlin
package com.bliss.identity.domain.auth

import assertk.assertThat
import assertk.assertions.*
import io.kotest.property.Arb
import io.kotest.property.arbitrary.int
import io.kotest.property.checkAll
import java.security.SecureRandom
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test

class OtpCodeTest {
    @Test fun `of accepts exactly six digits`() {
        assertThat(OtpCode.of("012345").value).isEqualTo("012345")
    }
    @Test fun `of rejects non-six-digit input`() {
        assertThat { OtpCode.of("12345") }.isFailure().isInstanceOf(IllegalArgumentException::class)
        assertThat { OtpCode.of("12345a") }.isFailure().isInstanceOf(IllegalArgumentException::class)
    }
    @Test fun `generate always produces a valid six-digit code`() = runBlocking {
        val rnd = SecureRandom()
        checkAll(Arb.int(1..200)) {
            val code = OtpCode.generate(rnd).value
            assertThat(code.length).isEqualTo(6)
            assertThat(code.all { it.isDigit() }).isTrue()
        }
    }
}
```

- [ ] **Step 2: Run red** — `./gradlew :identity:domain:test --tests '*OtpCodeTest*'`. Expected: FAIL (unresolved `OtpCode`).
- [ ] **Step 3: Implement** `OtpCode.kt`:

```kotlin
package com.bliss.identity.domain.auth

import java.security.SecureRandom

@JvmInline
value class OtpCode private constructor(val value: String) {
    companion object {
        const val LENGTH = 6
        fun of(raw: String): OtpCode {
            require(raw.length == LENGTH && raw.all(Char::isDigit)) { "OTP code must be $LENGTH digits" }
            return OtpCode(raw)
        }
        fun generate(random: SecureRandom): OtpCode =
            OtpCode(buildString { repeat(LENGTH) { append(random.nextInt(10)) } })
    }
}
```

- [ ] **Step 4:** Implement `ChallengeSecret.kt` mirroring `identity/domain/.../auth/State.kt` (32 random bytes → url-safe base64 no-padding via `Base64.getUrlEncoder().withoutPadding()`), with `generate(SecureRandom)` and `of(String)`. Implement `EmailAddress.kt`:

```kotlin
package com.bliss.identity.domain.user

@JvmInline
value class EmailAddress private constructor(val value: String) {
    companion object {
        private val SHAPE = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")
        fun of(raw: String): EmailAddress {
            val normalized = raw.trim().lowercase()
            require(normalized.length in 3..254 && SHAPE.matches(normalized)) { "Invalid email address" }
            return EmailAddress(normalized)
        }
    }
}
```

- [ ] **Step 5:** Add `ChallengeSecretTest.kt` (generate → `of` round-trips; distinct across calls) and `EmailAddressTest.kt` (property test: `of` output is always lowercase+trimmed; rejects strings without `@`/domain). Mirror `DisplayNameTest.kt` style (kotest `checkAll`, assertk).
- [ ] **Step 6: Run green** — `./gradlew :identity:domain:test`. Expected: PASS. Also `./gradlew :identity:domain:test --tests '*DomainArchitectureTest*'` stays green.
- [ ] **Step 7: Commit** — `git commit -s -m "feat(identity-domain): OtpCode, ChallengeSecret, EmailAddress value types"`

## Task 2.2: `EmailOtpChallenge` entity + `ChallengeId` + `Provider.EMAIL`

**Files:** Create `identity/domain/.../auth/EmailOtpChallenge.kt`, `…/auth/ChallengeId.kt`; Modify `identity/domain/.../provider/Provider.kt`; Tests alongside.

**Interfaces produced:** `EmailOtpChallenge(id, email, codeHash, bindingHash, attempts, createdAt, expiresAt, consumedAt)` with `isExpired(now)`, `isConsumed()`, `isLocked()`, `withIncrementedAttempt()`, `consumed(now)`, `MAX_ATTEMPTS=5`; `Provider.EMAIL` (`toWire()="email"`).

- [ ] **Step 1: Failing test** `EmailOtpChallengeTest.kt` — assert: fresh challenge not expired/consumed/locked; `isExpired(expiresAt)` true (boundary inclusive); `withIncrementedAttempt()` bumps attempts and after `MAX_ATTEMPTS` `isLocked()` is true; `consumed(now)` sets `consumedAt` and flips `isConsumed()`.
- [ ] **Step 2: Run red** — `./gradlew :identity:domain:test --tests '*EmailOtpChallengeTest*'`. Expected FAIL.
- [ ] **Step 3: Implement** (`codeHash`/`bindingHash` are opaque `String`s — hashing is an infra concern via `TokenHasher`, keeping `MessageDigest` out of domain to sidestep any Konsist ambiguity):

```kotlin
package com.bliss.identity.domain.auth

import com.bliss.identity.domain.user.EmailAddress
import java.time.Instant

data class EmailOtpChallenge(
    val id: ChallengeId,
    val email: EmailAddress,
    val codeHash: String,
    val bindingHash: String,
    val attempts: Int,
    val createdAt: Instant,
    val expiresAt: Instant,
    val consumedAt: Instant?,
) {
    fun isExpired(now: Instant): Boolean = !now.isBefore(expiresAt)
    fun isConsumed(): Boolean = consumedAt != null
    fun isLocked(): Boolean = attempts >= MAX_ATTEMPTS
    fun withIncrementedAttempt(): EmailOtpChallenge = copy(attempts = attempts + 1)
    fun consumed(now: Instant): EmailOtpChallenge = copy(consumedAt = now)

    companion object { const val MAX_ATTEMPTS = 5 }
}
```

- [ ] **Step 4:** Implement `ChallengeId.kt` (UUID value type, mirror `AuthAttemptId`/`SessionId`). Modify `Provider.kt`: add `EMAIL` with `toWire()` → `"email"` (and `fromWire`/`ProviderMapper` if present — grep and update the mapper in infra too). Add a `ProviderTest` case asserting `Provider.EMAIL.toWire() == "email"` round-trips.
- [ ] **Step 5: Run green** — `./gradlew :identity:domain:test`. Expected PASS.
- [ ] **Step 6: Commit** — `git commit -s -m "feat(identity-domain): EmailOtpChallenge entity + Provider.EMAIL"`

## Task 2.3: Ports (repository, sender, hasher, extensions)

**Files:** Create `identity/application/.../ports/{EmailOtpChallengeRepository,EmailSender,TokenHasher}.kt`; Modify `ports/{RandomFactory,UserRepository,SessionRepository}.kt`.

**Interfaces produced (consumed by 2.4/2.5 and Wave 3 adapters):**

```kotlin
interface EmailOtpChallengeRepository {
    suspend fun create(challenge: EmailOtpChallenge)
    suspend fun findActiveByEmail(email: EmailAddress, now: Instant): EmailOtpChallenge?   // newest non-expired, non-consumed
    suspend fun save(challenge: EmailOtpChallenge)                                          // persist attempt/consumed updates
    suspend fun countCreatedSince(email: EmailAddress, since: Instant): Int                 // daily cap
    suspend fun latestCreatedAt(email: EmailAddress): Instant?                              // cooldown
    suspend fun deleteExpired(now: Instant)                                                 // TTL cleanup
}
fun interface EmailSender { suspend fun sendOtp(to: EmailAddress, code: OtpCode) }
fun interface TokenHasher { fun hash(raw: String): String }                                // SHA-256 hex
```
- `RandomFactory` gains `fun newOtpCode(): OtpCode` and `fun newChallengeSecret(): ChallengeSecret`.
- `UserRepository` gains `suspend fun findByEmail(email: EmailAddress): List<User>`.
- `SessionRepository` gains `suspend fun revokeAllForUserExcept(userId: UserId, keep: SessionId, at: Instant)`.

- [ ] **Step 1:** Write the three new port files + the three modifications exactly as above (interfaces only — no test needed for declarations; they're exercised by 2.4/2.5).
- [ ] **Step 2:** Extend the in-memory fakes so 2.4/2.5 can use them: add `InMemoryEmailOtpChallengeRepository` (infrastructure `testFixtures`, LinkedHashMap by id), a `RecordingEmailSender` (captures `(to, code)`), a `FakeTokenHasher` (`hash = "sha256:" + raw` deterministic stub), extend `FixedRandomFactory` with seeded `ArrayDeque`s for `newOtpCode`/`newChallengeSecret`, and extend `FakeUserRepository`/`FakeSessionRepository` with the new methods.
- [ ] **Step 3: Compile** — `./gradlew :identity:application:compileKotlin :identity:application:compileTestFixturesKotlin`. Expected: success.
- [ ] **Step 4: Konsist** — `./gradlew :identity:application:test --tests '*ApplicationArchitectureTest*'`. Expected PASS (no framework/vendor imports).
- [ ] **Step 5: Commit** — `git commit -s -m "feat(identity-application): OTP ports + in-memory fakes"`

## Task 2.4: `RequestEmailOtpUseCase` (start)

**Files:** Create `identity/application/.../usecases/RequestEmailOtpUseCase.kt`; Test `identity/infrastructure/src/test/.../usecases/RequestEmailOtpUseCaseTest.kt` (infra test dir — where `InMemory*` repos live, mirroring `CompleteOidcLoginUseCaseTest`).

**Interfaces produced:** `RequestEmailOtpCommand(email: String)`; `RequestEmailOtpResult` = sealed `{ Sent(challengeSecret: String) , RateLimited }`. The raw `challengeSecret` is returned for the route to set as the binding cookie (mirrors `BeginOidcLogin` returning `authorizeUrl`). A malformed email throws `IllegalArgumentException` (route → 400).

**Behaviour:** normalize → cooldown check (`latestCreatedAt` within `COOLDOWN` → `RateLimited`) → daily cap (`countCreatedSince(now-24h) >= DAILY_CAP` → `RateLimited`) → generate `OtpCode` + `ChallengeSecret`; `hasher.hash(code.value)`, `hasher.hash(secret.value)`; `create(challenge)` with `expiresAt = now + TTL`; `emailSender.sendOtp(email, code)`; return `Sent(secret.value)`. Constants: `TTL=10min`, `COOLDOWN=60s`, `DAILY_CAP=8`. (Per-IP limiting is ingress-nginx's job — not here.)

- [ ] **Step 1: Failing tests** — (a) happy path: sends email, stores a challenge whose `codeHash == hasher.hash(sentCode)`, returns `Sent` with a non-empty secret whose `hash == storedBindingHash`; (b) second call within 60 s → `RateLimited`, no second email; (c) 9th call in 24 h → `RateLimited`; (d) malformed email → throws. Use `RecordingEmailSender`, `InMemoryEmailOtpChallengeRepository`, `FixedClock`, `FixedRandomFactory` (seeded), `FakeTokenHasher`.
- [ ] **Step 2: Run red** — `./gradlew :identity:infrastructure:test --tests '*RequestEmailOtpUseCaseTest*'`. Expected FAIL.
- [ ] **Step 3: Implement** the use case (constructor-injected ports: `EmailOtpChallengeRepository, EmailSender, TokenHasher, RandomFactory, IdGenerator, Clock`; `suspend fun execute`). Keep the cooldown/cap thresholds as named `Duration`/`Int` constructor params with the defaults above (so tests can shrink them).
- [ ] **Step 4: Run green** — same command. Expected PASS.
- [ ] **Step 5: Commit** — `git commit -s -m "feat(identity-application): RequestEmailOtpUseCase (start)"`

## Task 2.5: `VerifyEmailOtpUseCase` (verify + Option-B resolution + session mint)

**Files:** Create `usecases/VerifyEmailOtpUseCase.kt`, `usecases/VerifyEmailOtpError.kt`; Test `identity/infrastructure/src/test/.../usecases/VerifyEmailOtpUseCaseTest.kt`.

**Interfaces produced:** `VerifyEmailOtpCommand(email: String, code: String, cookieSecret: String?)`; `VerifyEmailOtpResult(sessionId: SessionId, userId: UserId)`. Errors (thrown sealed `VerifyEmailOtpError`): `NoChallenge`, `BindingMismatch`, `CodeMismatch`, `Expired`, `Locked` — **all map to 401 at the route** (uniform, non-enumerating).

**Behaviour:**
1. normalize email; `findActiveByEmail(email, now)` → null ⇒ `NoChallenge`.
2. `challenge.isExpired(now)` ⇒ delete/`Expired`; `challenge.isLocked()` ⇒ `Locked`.
3. `cookieSecret == null || hasher.hash(cookieSecret) != challenge.bindingHash` ⇒ `save(challenge.withIncrementedAttempt())` then `BindingMismatch`.
4. `hasher.hash(code) != challenge.codeHash` ⇒ `save(challenge.withIncrementedAttempt())`; if now locked, still `CodeMismatch`.
5. success: `save(challenge.consumed(now))`; **resolve account (Option B):**
   - `userProviders.findByProviderAndSubject(Provider.EMAIL, email.value)` → `existing.userId`; else
   - `users.findByEmail(email)`: `size == 1` → attach `UserProvider(user.id, EMAIL, email.value, emailAtLink=email.value, linkedAt=now)`, use that user; `size != 1` (0 or >1 ambiguous) → create new `User(idGenerator.newUserId(), DisplayName.of("Joueur"), createdAt=now, lastSeenAt=now, email=email.value)`, link EMAIL provider.
   - `users.updateLastSeenAt(userId, now)`.
6. mint: `val sessionId = idGenerator.newSessionId(); sessions.create(Session(sessionId, userId, now, now, revokedAt=null)); return VerifyEmailOtpResult(sessionId, userId)`.

- [ ] **Step 1: Failing tests** covering: new-email signup (creates user + EMAIL link + session); existing EMAIL link resolves to same account (no new user); **collision** — a Google user with `users.email == alice@example.com` + no EMAIL link → OTP for that email attaches an EMAIL link to the *same* userId (assert userId equals the Google account's); ambiguous (two users same email) → new account; wrong binding cookie → `BindingMismatch` + attempt incremented; wrong code → `CodeMismatch` + attempt incremented; 6th wrong attempt → `Locked`; expired → `Expired`; missing challenge → `NoChallenge`. Seed `FakeUserRepository`/`FakeUserProviderRepository` accordingly.
- [ ] **Step 2: Run red** — `./gradlew :identity:infrastructure:test --tests '*VerifyEmailOtpUseCaseTest*'`. Expected FAIL.
- [ ] **Step 3: Implement** `VerifyEmailOtpError` (sealed) + the use case per the algorithm.
- [ ] **Step 4: Run green.** Expected PASS. Also re-run `:identity:application:test` + Konsist.
- [ ] **Step 5: Commit** — `git commit -s -m "feat(identity-application): VerifyEmailOtpUseCase (verify + Option-B resolution)"`

## Task 2.6: `LogoutAllUseCase`

**Files:** Create `usecases/LogoutAllUseCase.kt`; Test `identity/infrastructure/src/test/.../usecases/LogoutAllUseCaseTest.kt`.

**Interfaces produced:** `LogoutAllCommand(currentSessionId: SessionId)`; `execute` resolves the session's `userId` then `sessions.revokeAllForUserExcept(userId, currentSessionId, now)`.

- [ ] **Step 1: Failing test** — seed 3 sessions for a user (+ 1 for another user); after `execute(current)`, the current + the other user's stay active, the two siblings are revoked. Use `FakeSessionRepository` (extend it to honor `revokeAllForUserExcept` + expose active-state).
- [ ] **Step 2: Run red / Step 3: Implement / Step 4: Run green** — `./gradlew :identity:infrastructure:test --tests '*LogoutAllUseCaseTest*'`.
- [ ] **Step 5: Commit** — `git commit -s -m "feat(identity-application): LogoutAllUseCase (revoke all except caller)"`

---

# WAVE 3 — Identity infrastructure (adapters + migrations + Brevo; still dark)

## Task 3.1: Migrations V9 (provider expand) + V10 (challenge table)

**Files:** Create `identity/infrastructure/src/main/resources/db/migration/V9__user_providers_add_email.sql`, `V10__email_otp_challenges.sql`.

- [ ] **Step 1:** `V9` (expand-and-contract — widen the CHECK before any code writes `'email'`):

```sql
-- Expand step (ADR-0091): widen the CHECK before 'email' links are written; identity_auth_attempts stays OIDC-only.
ALTER TABLE identity_user_providers DROP CONSTRAINT identity_user_providers_provider_check;
ALTER TABLE identity_user_providers ADD CONSTRAINT identity_user_providers_provider_check
    CHECK (provider IN ('google', 'apple', 'email'));
```
(Confirm the exact auto-generated constraint name via `\d identity_user_providers` against a scratch migrate; if it differs, use the real name.)

- [ ] **Step 2:** `V10` (model on V4 auth_attempts — expiring token store):

```sql
-- OTP challenges (ADR-0091): code_hash/binding_hash are SHA-256 hex, never plaintext; TTL cleanup via expires_at.
CREATE TABLE identity_email_otp_challenges (
    challenge_id  UUID        PRIMARY KEY,
    email         TEXT        NOT NULL,
    code_hash     TEXT        NOT NULL,
    binding_hash  TEXT        NOT NULL,
    attempts      INT         NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    consumed_at   TIMESTAMPTZ
);

CREATE INDEX idx_identity_email_otp_challenges_email ON identity_email_otp_challenges (email);
CREATE INDEX idx_identity_email_otp_challenges_expires_at ON identity_email_otp_challenges (expires_at);
```

- [ ] **Step 3: Verify migrate** — the next task's Testcontainers test runs Flyway; for a quick check, `./gradlew :identity:infrastructure:test --tests '*PostgresSessionRepositoryTest*'` (existing test re-runs Flyway including V9/V10). Expected: migration applies cleanly.
- [ ] **Step 4: Commit** — `git commit -s -m "feat(identity-infrastructure): V9 provider expand + V10 otp challenge table"`

## Task 3.2: Postgres adapters + hasher + random impl

**Files:** Create `persistence/PostgresEmailOtpChallengeRepository.kt`, `auth/Sha256TokenHasher.kt`; Modify `persistence/PostgresUserRepository.kt` (`findByEmail`), `persistence/PostgresSessionRepository.kt` (`revokeAllForUserExcept`), `auth/SecureRandomFactory.kt`; Tests under `identity/infrastructure/src/test/.../persistence/` + `.../auth/`.

- [ ] **Step 1:** `Sha256TokenHasher` (SHA-256 hex via `MessageDigest.getInstance("SHA-256")`) + unit test (known vector). Implement `SecureRandomFactory.newOtpCode()`/`newChallengeSecret()` delegating to the domain `generate(random)` factories.
- [ ] **Step 2: Failing Testcontainers test** `PostgresEmailOtpChallengeRepositoryTest.kt` mirroring `PostgresSessionRepositoryTest` (PER_CLASS, `assumeTrue(Docker)`, Flyway with `flyway_schema_history_identity`, `@AfterEach TRUNCATE identity_email_otp_challenges`): round-trip create→findActiveByEmail; expired rows excluded; `countCreatedSince`/`latestCreatedAt` correct; `save` persists attempts/consumed; `deleteExpired` removes expired only.
- [ ] **Step 3: Run red** — `./gradlew :identity:infrastructure:test --tests '*PostgresEmailOtpChallengeRepositoryTest*'`.
- [ ] **Step 4: Implement** the repository in raw JDBC mirroring `PostgresAuthAttemptRepository` (companion const SQL; `withContext(Dispatchers.IO)`; `expiresAt.truncatedTo(ChronoUnit.MICROS)`; `OffsetDateTime` read/write at UTC; `setNull(idx, Types.TIMESTAMP_WITH_TIMEZONE)` for `consumed_at`). Implement `PostgresUserRepository.findByEmail` (`SELECT … WHERE lower(email) = ?`) + `PostgresSessionRepository.revokeAllForUserExcept` (`UPDATE identity_sessions SET revoked_at = ? WHERE user_id = ? AND session_id <> ? AND revoked_at IS NULL`). Add focused tests for both new methods.
- [ ] **Step 5: Run green** — `./gradlew :identity:infrastructure:test`. Expected PASS (skips gracefully without Docker).
- [ ] **Step 6: Commit** — `git commit -s -m "feat(identity-infrastructure): Postgres OTP repo, SHA-256 hasher, findByEmail, revoke-all-except"`

## Task 3.3: Brevo `EmailSender` adapter

**Files:** Create `email/BrevoEmailSender.kt`; Modify `config/IdentityApiConfig.kt`; Test `.../email/BrevoEmailSenderTest.kt` (Ktor `MockEngine`).

- [ ] **Step 1: Fetch the real Brevo payload shape FIRST** (CLAUDE.md — never synthesize a complex external payload). `WebFetch` the Brevo "Send a transactional email" API reference (`POST https://api.brevo.com/v3/smtp/email`, headers `api-key`, `content-type: application/json`; body `{ sender: {name,email}, to: [{email}], subject, htmlContent/textContent }`). Capture one known-good example body verbatim into the test.
- [ ] **Step 2: Failing test** with Ktor `MockEngine`: `sendOtp` POSTs to `/v3/smtp/email` with the `api-key` header, `to` = the address, and a body containing the 6-digit code; non-2xx → throws a typed `EmailSendFailed`. Mirror `KtorOidcCodeExchanger` for HttpClient construction/JSON.
- [ ] **Step 3: Run red / Step 4: Implement** `BrevoEmailSender(httpClient, config)` building the exact fetched body; French tutoiement subject/copy ("Ton code de connexion WordSparrow"). Add `BrevoConfig(apiKey, senderEmail, senderName)` to `IdentityApiConfig`, read via `System.getenv("BREVO_API_KEY")` (nullable — required only when the OTP flag is on; do not `requireEnv` unconditionally). Konsist: Brevo has no SDK — using Ktor HttpClient keeps `api/`/`infrastructure/` clean.
- [ ] **Step 5: Run green** — `./gradlew :identity:infrastructure:test --tests '*BrevoEmailSenderTest*'`.
- [ ] **Step 6: Commit** — `git commit -s -m "feat(identity-infrastructure): Brevo transactional EmailSender adapter"`

## Task 3.4: `ChallengeCookies` + routes + DTOs + wiring (flag-gated)

**Files:** Create `api/auth/ChallengeCookies.kt`, `api/routes/EmailOtpRoute.kt`, `api/routes/LogoutAllRoute.kt`, `api/dto/EmailStartRequest.kt`, `api/dto/EmailVerifyRequest.kt`; Modify `api/Wiring.kt`, `api/Module.kt`. Route tests under `identity/api/src/test/.../routes/`.

> This PR is the wiring seam and may exceed 400 lines with tests — invoke the standing cap-override with justification ("cohesive route+wiring seam; splitting strands untested routes").

**Interfaces consumed:** the three use cases (Wave 2), `ChallengeSecret` cookie value, `SessionCookies.issue`.

- [ ] **Step 1:** `ChallengeCookies` object mirroring `SessionCookies` but: `NAME = "__Secure-ws_otp_chal"`, `maxAge = 600` (10 min), `SameSite=Lax`, `Secure`, `HttpOnly`, `CookieEncoding.RAW`, `Domain=wordsparrow.io`; `issue(call, secret)`, `read(call): String?`, `clear(call)`.
- [ ] **Step 2:** DTOs in `api.dto` (pure — no domain/ktor imports): `EmailStartRequest(val email: String)`, `EmailVerifyRequest(val email: String, val code: String)`.
- [ ] **Step 3: Failing route tests** (`testApplication` + `Wiring.forTesting(...)`, `followRedirects=false`): `start` happy path → `202` + a `__Secure-ws_otp_chal` `Set-Cookie`; malformed email → `400` problem+json; rate-limited → `429`. `verify` happy path (with the challenge cookie) → `200` `WhoAmIResponse` + `__Secure-ws_session` `Set-Cookie` + cleared challenge cookie; wrong/expired code → `401` uniform. `logout-all` → `204`; unauthenticated → `401`.
- [ ] **Step 4: Run red** — `./gradlew :identity:api:test --tests '*EmailOtpRouteTest*' --tests '*LogoutAllRouteTest*'`.
- [ ] **Step 5: Implement** the routes: deserialize with the `call.receive<T>()`-guarded idiom → `call.problem(...)` on failure; `start` maps `IllegalArgumentException`→400, `RateLimited`→429, `Sent(secret)`→`ChallengeCookies.issue` + 202; `verify` reads `ChallengeCookies.read`, on success `SessionCookies.issue` + `ChallengeCookies.clear` + 200 whoami body, on `VerifyEmailOtpError`→uniform 401; `logout-all` reads `SessionCookies`, calls `LogoutAllUseCase`, 204. Then wire in `Wiring.kt` (`forProduction` builds the repos/hasher/sender/use cases **only when `System.getenv("IDENTITY_EMAIL_OTP_ENABLED")?.toBooleanStrictOrNull() == true`** — default-off dark launch, `// Flag retirement: 2026-10-01`; nullable accessors otherwise) + `forTesting` nullable params; mount in `Module.kt` guarded by `wiring.requestEmailOtpOrNull?.let { … }` etc. `logout-all` is **not** flag-gated (pure session op, safe to ship live).
- [ ] **Step 6: Run green** — `./gradlew :identity:api:test`. Expected PASS incl. `ApiArchitectureTest` (dto purity).
- [ ] **Step 7: Full backend build** — `./gradlew build --parallel --build-cache && ./gradlew spotlessCheck`. Expected PASS.
- [ ] **Step 8: Commit** — `git commit -s -m "feat(identity-api): OTP start/verify + logout-all routes, challenge cookie, flag-gated wiring"`

---

# WAVE 4 — Frontend (behind `VITE_FEATURE_EMAIL_AUTH`, default-off)

## Task 4.1: `OtpCodeInput` primitive

**Files:** Create `frontend/src/ui/components/primitives/OtpCodeInput.tsx`; Test `frontend/tests/primitives/otp-code-input.test.tsx`.

> A **sibling** of `PinInput` — do not reuse it: `PinInput` is hard-wired to the lobby Crockford alphabet/length and would mangle a numeric code.

- [ ] **Step 1: Failing test** (Testing Library): renders 6 numeric slots (`type="numeric"`/`inputMode`), `onValueChange` fires the concatenated digits, `errorText` renders with `role="alert"` when `invalid`, placeholder `_`.
- [ ] **Step 2: Run red** — `cd frontend && pnpm test otp-code-input`.
- [ ] **Step 3: Implement** wrapping `@ark-ui/react/pin-input` with `type="numeric"`, `count={6}`, no Crockford normalizer; mirror `PinInput.tsx` styling/a11y (visually-hidden label, `role="alert"` error).
- [ ] **Step 4: Run green** + `pnpm typecheck`.
- [ ] **Step 5: Commit** — `git commit -s -m "feat(frontend): OtpCodeInput primitive (6-digit numeric)"`

## Task 4.2: `AuthClient` OTP methods + adapter

**Files:** Modify `frontend/src/application/auth/AuthClient.ts`, `frontend/src/infrastructure/auth/HttpAuthClient.ts`; Test `frontend/tests/http-auth-client-otp.test.tsx` (or extend existing).

**Interfaces produced:** `startEmailOtp(email: string): Promise<'sent' | 'rate_limited' | 'invalid'>`; `verifyEmailOtp(email, code): Promise<'ok' | 'invalid'>`; `logoutAll(): Promise<void>`.

- [ ] **Step 1: Failing test** with a mocked openapi-fetch client (or MSW): `startEmailOtp` POSTs `/v1/auth/email/start` with `credentials:'include'`, maps 202→`'sent'`, 429→`'rate_limited'`, 400→`'invalid'`; `verifyEmailOtp` maps 200→`'ok'`, 401→`'invalid'`; `logoutAll` POSTs `/v1/auth/logout-all`.
- [ ] **Step 2: Run red / Step 3: Implement** on the port + `HttpAuthClient` (mirror the existing `whoami`/`logout` `{ data, error, response }` destructuring + `credentials:'include'`).
- [ ] **Step 4: Run green** + `pnpm typecheck`.
- [ ] **Step 5: Commit** — `git commit -s -m "feat(frontend): AuthClient email-OTP + logoutAll methods"`

## Task 4.3: `/connexion` two-step screen + flag wiring

**Files:** Create `frontend/src/ui/routes/connexion.tsx`, `frontend/src/ui/v2/ConnexionScreen.tsx`; Modify `frontend/src/ui/router.ts`, `frontend/src/main.tsx`, `frontend/src/vite-env.d.ts`; Tests `frontend/tests/connexion-screen.test.tsx` + `frontend/e2e/connexion.spec.ts`.

- [ ] **Step 1:** Add `readonly VITE_FEATURE_EMAIL_AUTH: 'true' | 'false'` to `vite-env.d.ts`; read `import.meta.env.VITE_FEATURE_EMAIL_AUTH === 'true'` in `main.tsx`, pass `emailAuth` into `createAppRouter`; in `router.ts` register `ConnexionRoute` only when `emailAuth` (mirror the `multiplayer ? [...] : []` pattern). Keep the Google sign-in surface unchanged; when the flag is on, `SignInPrompt`/`SignInButton` also link to `/connexion` ("… ou avec ton adresse e-mail").
- [ ] **Step 2: Failing component test** — `ConnexionScreen` step 1 shows an email field + submit; on `startEmailOtp → 'sent'` advances to step 2 (the `OtpCodeInput`); on `verifyEmailOtp → 'ok'` calls `refresh()` (flip anon→authed) and navigates to `returnTo`/`/`; `'invalid'` shows a `role="alert"` error; `'rate_limited'` shows the cooldown copy; announces transitions via the shared `Announcer`. Use a fake `AuthClient`.
- [ ] **Step 3: Run red / Step 4: Implement** the screen (tutoiement copy, typographic apostrophes, `aria-busy` on submit, `Announcer.say('Code envoyé')` / `say('Code incorrect', {assertive:true})`). Wire `refresh()` from `useAuth()`.
- [ ] **Step 5: e2e** `connexion.spec.ts` (Playwright + MSW fixtures): full email→code→authed happy path + an axe pass (`runAxe`) on both steps.
- [ ] **Step 6: Run green** — `pnpm test connexion`, `pnpm typecheck`, `pnpm e2e connexion`, `pnpm a11y`.
- [ ] **Step 7: Commit** — `git commit -s -m "feat(frontend): /connexion email-OTP screen behind VITE_FEATURE_EMAIL_AUTH"`

## Task 4.4: "Se déconnecter de tous les appareils"

**Files:** Modify `frontend/src/ui/v2/CompteScreen.tsx`; Test `frontend/tests/compte-logout-all.test.tsx`.

- [ ] **Step 1: Failing test** — a `SettingsRow` "Se déconnecter de tous les appareils" in the "Connexion" group calls `authClient.logoutAll()` then `refresh()`; announces success.
- [ ] **Step 2: Run red / Step 3: Implement** the row next to the existing "Se déconnecter" (reuse the `logout` handler shape; `SettingsRow` + `SignOut` icon). Not flag-gated (works for Google/Apple sessions too).
- [ ] **Step 4: Run green** + `pnpm typecheck`.
- [ ] **Step 5: Commit** — `git commit -s -m "feat(frontend): sign-out-everywhere row on /compte"`

---

# WAVE 5 — Deploy, secrets & bright release (operator-gated)

## Task 5.1: Chart env + deploy the dark backend

**Files:** Modify `identity/api/deploy/chart/values.yaml`, `identity/api/deploy/chart/templates/ingress.yaml` (+ `templates/deployment.yaml` env list if needed).

- [ ] **Step 1:** Add `IDENTITY_EMAIL_OTP_ENABLED: "false"` to the inline `env:` list (non-secret) with a `# Flag retirement: 2026-10-01` comment. `BREVO_API_KEY` needs **no template change** — it rides the existing `envFromSecret` bag. Add non-secret `BREVO_SENDER_EMAIL`/`BREVO_SENDER_NAME` to `env:`.
- [ ] **Step 1b:** Add the per-IP rate-limit annotation to the identity ingress so the ADR-0091 email-bombing mitigation actually ships: `nginx.ingress.kubernetes.io/limit-rps` (+ `limit-burst-multiplier`) on `templates/ingress.yaml`, mirroring `infra/observability/templates/ingress-otlp-public.yaml` (ADR-0033). Scope it to the auth host; confirm the value is generous enough for legitimate OIDC + OTP traffic.
- [ ] **Step 2: Lint** — `helm lint identity/api/deploy/chart` (or the repo's `helm-lint`/`api-chart-lint` invocation). Expected PASS.
- [ ] **Step 3: Commit + deploy** — `git commit -s -m "feat(identity): chart env for email-OTP flag (dark)"`. Merges + deploys the whole backend **dark** (flag off; endpoints wired but the start/verify use cases return null accessors → routes 404, safe).

## Task 5.2: Operator bootstrap (manual, out-of-band — document, do not automate in CI)

- [ ] **Step 1:** In the Brevo dashboard: verify the sending domain — add **SPF, DKIM, DMARC** DNS records for `wordsparrow.io` (Cloudflare-managed), set up `no-reply@wordsparrow.io`. Mint the transactional API key.
- [ ] **Step 2:** Add `BREVO_API_KEY` to identity's bootstrapped `envFromSecret` Secret: `kubectl create secret generic <identity-env-secret> --from-literal=BREVO_API_KEY=… --dry-run=client -o yaml | kubectl apply -f -` (per `docs/secrets.md`; never in CI). Roll the identity-api deployment.
- [ ] **Step 3: Verify end-to-end with the flag still off for the public**, by flipping `IDENTITY_EMAIL_OTP_ENABLED=true` on the backend first and testing against the API directly (real code delivered to a test inbox, redeemed, `__Secure-ws_session` minted, `logout-all` revokes). Confirm the code lands in the inbox, not spam (domain-auth check).

## Task 5.3: Bright release

- [ ] **Step 1:** Set `VITE_FEATURE_EMAIL_AUTH=true` for the frontend build (Cloudflare Pages env) and confirm `IDENTITY_EMAIL_OTP_ENABLED=true` on the backend.
- [ ] **Step 2: Smoke test** the live `/connexion` flow (new email → account created; existing-Google-email → same account via collision).
- [ ] **Step 3:** Schedule the flag-retirement cleanup (remove both flags + the `? :` guards) per the retirement date once stable.

**Fast-follow (separate spec/plan, not in this plan):** "new sign-in" notification email.

---

## Self-review

- **Spec coverage:** mechanism (W2.1–2.5) ✓; account model Option-B + ambiguity + asymmetry (2.5) ✓; challenge-cookie binding (2.5 check, 3.4 cookie) ✓; global revocation (2.6, 3.4, 4.4) ✓; EmailSender port + Brevo (2.3, 3.3) ✓; migrations expand-and-contract (3.1) ✓; enumeration-safe start + rate-limit split app/ingress (2.4, ADR-0091) ✓; OTP defaults 6-digit/10-min/5-attempt/60-s/8-day (2.1, 2.4) ✓; schema-first (1.3) ✓; two ADRs + INDEX + secrets (1.1, 1.2) ✓; feature flags dark→bright w/ expiry (3.4, 5.1, 5.3) ✓; frontend screens + a11y/tutoiement (4.x) ✓; grid/game unaffected (noted, no task) ✓; passkeys/explicit-link/full-merge deferred (non-goals — no task, intentional) ✓; new-sign-in alert deferred ✓.
- **Placeholder scan:** constants are concrete; the one lookup deferred to runtime is the auto-generated CHECK-constraint name (3.1 Step 1 tells the implementer how to confirm it) and the Brevo payload (3.3 Step 1 fetches it — deliberately not synthesized). No TBD/TODO.
- **Type consistency:** `EmailAddress`, `OtpCode`, `ChallengeSecret`, `EmailOtpChallenge`, `Provider.EMAIL`, the port signatures, and the three use-case command/result types are used identically across Wave 2 → Wave 3 → Wave 4.
