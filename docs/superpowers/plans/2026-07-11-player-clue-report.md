# Player Clue/Word Report ("Signaler") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this repo executes multi-PR
> features through the **dispatch skill** (`.claude/skills/dispatch/SKILL.md`)
> — one implementer subagent per wave/PR, each doing its own ADR pre-read
> (`scripts/adr-context.sh <paths>`) and TDD, gated by §6a review + green CI
> before the next wave starts. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a player flag a bad clue/word from the play grid; reports land
in the `survey/` context as a maintainer queue, harm reports email the
maintainer, and accepted reports feed the existing correctif/gold loop.

**Architecture:** One synchronous `POST /v1/signalements` on `survey/`
(optional auth) serves solo/daily, multiplayer, and the homescreen
mini-game. Reports persist to a new `player_reports` table via a
`PlayerReport` aggregate; harm reasons trigger a new survey Brevo
`EmailSender`; a maintainer-only `/signalements` page triages the queue and
turns accepted reports into correctifs. RGPD anonymization rides the
existing `UserDeletedConsumer`.

**Tech Stack:** Kotlin/JVM + Ktor (survey), Postgres + Flyway,
kotlinx.serialization, JUnit 5 + assertk + kotlinx-coroutines-test; React
19 + TS + Panda CSS + Ark UI + TanStack Router (frontend); OpenAPI 3.1.0
schema-first with generated TS types.

## Global Constraints

- **Schema-first (ADR-0001 §3 / ADR-0003):** `survey/api/openapi.yaml`
  merges (Wave 1) **before** any producer/consumer code. Never hand-edit
  `frontend/src/infrastructure/api/survey/types.ts` — regenerate via
  `pnpm api:check`.
- **Hexagonal:** `domain/` depends on nothing; ports in `application/`;
  adapters in `infrastructure/`; Ktor edge in `api/`. No vendor SDK in
  `domain`/`application`. No cross-context imports. Konsist enforces.
- **400-line diff cap** per PR (ADR-0001 §4), excluding generated code.
  Wave 4 may invoke the standing cap-override (one privacy workstream).
- **Enums on the wire and in Postgres are lowercase** (`reason.name.lowercase()`,
  `CHECK (... IN (...))`). Match the prod writer's casing in fixtures.
- **Copy is French, tutoiement** ("tu", never "vous").
- **Comments:** one line, non-obvious *why* only. No multi-line comment
  blocks (§6a flags them).
- **Commits:** conventional, single bounded-context scope, `-s` (DCO).
- **RFC 7807** problem+json for all error responses (reuse
  `components/responses/ProblemDetails`).
- **No `println`/`console.log`; structured logs only.**

---

## File Structure

**Wave 1 — governance + contract**
- Create `docs/adr/0101-player-clue-report.md` — the feature ADR.
- Modify `docs/adr/INDEX.md` — registry rows for ADR-0101.
- Modify `survey/api/openapi.yaml` — `POST /v1/signalements` + `SignalementRequest`/`SignalementResponse`/`ReportReason` schemas; `GET /v1/signalements` (maintainer list) + `PostSignalementDecision`.

**Wave 2 — survey domain + persistence**
- Create `survey/domain/.../model/ReportReason.kt`, `.../model/PlayerReport.kt`; extend `.../model/Ids.kt` with `ReportId`.
- Create `survey/application/.../ports/SignalementRepository.kt`.
- Create `survey/infrastructure/.../persistence/PgSignalementRepository.kt`.
- Create `survey/infrastructure/src/main/resources/db/migration/V12__player_reports.sql`.
- Tests: `survey/domain/src/test/.../model/PlayerReportTest.kt`; `survey/application/src/test/.../usecases/InMemoryRepositories.kt` (extend with `InMemorySignalementRepository`).

**Wave 3 — capture endpoint + routing + anonymize**
- Create `survey/application/.../usecases/SubmitSignalementUseCase.kt`.
- Create `survey/application/.../ports/EmailSender.kt` + `OutboundEmail`.
- Create `survey/infrastructure/.../email/SurveyBrevoEmailSender.kt` + `SurveyBrevoConfig.kt`.
- Create `survey/api/.../dto/SignalementDtos.kt`; `survey/api/.../routes/SubmitSignalementRoute.kt`.
- Modify `survey/api/.../Module.kt` + `Wiring.kt` (register route + wire use case + email sender).
- Modify `survey/application/.../usecases/AnonymizeUserRatingsUseCase.kt` (+ its test) to call `signalements.anonymiseForUser`.
- Modify survey Helm chart values/secret for `SURVEY_BREVO_API_KEY` + maintainer address.
- Tests: `SubmitSignalementUseCaseTest.kt`, `SurveyBrevoEmailSenderTest.kt` (MockEngine).

**Wave 4 — frontend capture + privacy**
- Create `frontend/src/application/signalement/` (client interface + hook `useReportClue`).
- Create `frontend/src/infrastructure/api/survey/` signalement method (extend existing `client.ts`).
- Create `frontend/src/ui/components/grid/ReportClueSheet.tsx` (Ark Dialog bottom-sheet) + a report button in `CurrentCluePanel.tsx`.
- Modify the parent grid(s) to thread `word_text` + `surface` down to the panel.
- Modify `frontend/src/ui/v2/ConfidentialiteScreen.tsx` + `messages.fr.ts` (`v2.confidentialite.signalements.*`, `signalement.*`).
- Tests: `frontend/tests/report-clue-sheet.test.tsx`, extend `privacy-notice-sondage-section.test.tsx` sibling for signalements section.

**Wave 5 — triage page**
- Create `frontend/src/ui/routes/signalements.tsx` + `signalements.lazy.tsx` (capability-gated).
- Create `frontend/src/ui/components/signalements/SignalementQueue.tsx` (grouped list; Rejeter / Corriger reusing `CorrectifField`).
- Modify `frontend/src/ui/router.ts` (register `SignalementsRoute`).
- Backend: `GET /v1/signalements` list route + `POST /v1/signalements/{id}/decision` (dismiss/action) use case + route (from the Wave-1 schema).
- Tests: `SignalementQueue.test.tsx`; backend list/decision use-case tests.

---

## Wave 1 — ADR-0101 + schema (PR 1)

*Scope:* governance + contract only, no implementation. Gates: `openapi-lint`,
`registry-coherence`, `commitlint`, `dco`. This wave unblocks all others.

### Task 1.1: ADR-0101 + INDEX registry

**Files:**
- Create: `docs/adr/0101-player-clue-report.md`
- Modify: `docs/adr/INDEX.md`

- [ ] **Step 1: Pre-read governing ADRs.** Run
  `scripts/adr-context.sh survey/api/openapi.yaml survey/domain docs/adr/INDEX.md`
  and read ADR-0056 (survey context), ADR-0059, ADR-0079 (capability
  authz), ADR-0092/0094 (Brevo email) in full.

- [ ] **Step 2: Write the ADR.** Use the CLAUDE.md ADR template. Content:
  - **Context:** players hit bad clues in play; no report path exists
    (`contribuer.lazy.tsx` notes "No report endpoint yet"); survey owns
    clue quality.
  - **Decision:** player `POST /v1/signalements` on survey (optional
    auth); `PlayerReport` aggregate + `player_reports` table; harm reasons
    email the maintainer via a **new survey Brevo `EmailSender`** (mirrors
    ADR-0092/0094; no shared mailer; ADR-0032 is a SigNoz alert, not
    code); maintainer-only `/signalements` gated on the `contribuer`
    capability (ADR-0079); accepted reports become correctifs (existing
    gold loop, unchanged); RGPD anonymization via the existing
    `UserDeletedConsumer`.
  - **Consequences:** new Brevo secret in survey namespace; report↔item
    matching is a text join on `(mot, definition)` (no clue UUID —
    constraint from `V3__create_clue_cooldown.sql`); no auto-takedown/
    auto-training in V1.

- [ ] **Step 3: Add INDEX rows.** In `docs/adr/INDEX.md` under `## Registry`,
  add rows mirroring the existing column layout:
  ```
  ADR-0101  survey/**/*Signalement*                  Player clue-report: optional-auth capture, maintainer queue
  ADR-0101  survey/api/openapi.yaml                   POST /v1/signalements + ReportReason enum
  ADR-0101  frontend/src/**/signalement*             Report sheet + /signalements triage (contribuer-gated)
  ```
  (Match the actual whitespace/column style of surrounding rows.)

- [ ] **Step 4: Verify registry coherence locally.** Run
  `git add -A && git diff --cached --name-only` and confirm both the new
  ADR file and `INDEX.md` are staged together (registry-coherence fails a
  new `docs/adr/NNNN-*.md` without an INDEX change).

- [ ] **Step 5: Commit.**
  ```bash
  git commit -s -m "docs(adr): ADR-0101 player clue-report + INDEX rows"
  ```

### Task 1.2: OpenAPI schema for signalements

**Files:**
- Modify: `survey/api/openapi.yaml`

**Interfaces (produced — later waves consume these generated types):**
- `ReportReason` enum (lowercase): `mot_offensant, definition_offensante,
  erreur_sens, erreur_grammaire, definition_revele, ambigu, trop_facile,
  trop_difficile, autre`.
- `SignalementRequest { wordText, clueText, reason, note?, puzzleId?, surface }`.
- `surface` enum: `solo, daily, multiplayer, mini_game`.
- `SignalementResponse { reportId }`.
- `SignalementSummary { wordText, clueText, reason, count, latestNote?, latestAt }`
  and `SignalementListResponse { items }` for the maintainer list.
- `SignalementDecisionRequest { decision }` where decision ∈ `dismiss, action`.

- [ ] **Step 1: Add the paths.** Under `paths:`, mirror the existing
  `/v1/items/{itemId}/rating` idiom:
  ```yaml
    /v1/signalements:
      post:
        operationId: submitSignalement
        summary: Report a problem with a clue/word.
        tags: [signalements]
        requestBody:
          required: true
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SignalementRequest' }
        responses:
          '201':
            description: Report accepted.
            content:
              application/json:
                schema: { $ref: '#/components/schemas/SignalementResponse' }
          '400': { $ref: '#/components/responses/ProblemDetails' }
          '429': { $ref: '#/components/responses/ProblemDetails' }
      get:
        operationId: listSignalements
        summary: List pending reports (maintainer only).
        tags: [signalements]
        security: [{ sessionCookie: [] }]
        responses:
          '200':
            description: Pending reports grouped by clue+reason.
            content:
              application/json:
                schema: { $ref: '#/components/schemas/SignalementListResponse' }
          '403': { $ref: '#/components/responses/ProblemDetails' }
    /v1/signalements/{reportId}/decision:
      post:
        operationId: decideSignalement
        summary: Dismiss or action a report (maintainer only).
        tags: [signalements]
        security: [{ sessionCookie: [] }]
        parameters:
          - in: path
            name: reportId
            required: true
            schema: { type: string, format: uuid }
        requestBody:
          required: true
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SignalementDecisionRequest' }
        responses:
          '204': { description: Decision recorded. }
          '403': { $ref: '#/components/responses/ProblemDetails' }
          '404': { $ref: '#/components/responses/ProblemDetails' }
  ```

- [ ] **Step 2: Add the schemas.** Under `components/schemas`, using
  `x-enum-varnames` for the codegen (mirror `RatingRequest`):
  ```yaml
    ReportReason:
      type: string
      enum: [mot_offensant, definition_offensante, erreur_sens, erreur_grammaire, definition_revele, ambigu, trop_facile, trop_difficile, autre]
      x-enum-varnames: [MotOffensant, DefinitionOffensante, ErreurSens, ErreurGrammaire, DefinitionRevele, Ambigu, TropFacile, TropDifficile, Autre]
    ReportSurface:
      type: string
      enum: [solo, daily, multiplayer, mini_game]
      x-enum-varnames: [Solo, Daily, Multiplayer, MiniGame]
    SignalementRequest:
      type: object
      required: [wordText, clueText, reason, surface]
      properties:
        wordText: { type: string, minLength: 1, maxLength: 64 }
        clueText: { type: string, minLength: 1, maxLength: 512 }
        reason: { $ref: '#/components/schemas/ReportReason' }
        note: { type: string, maxLength: 500 }
        puzzleId: { type: string, format: uuid }
        surface: { $ref: '#/components/schemas/ReportSurface' }
    SignalementResponse:
      type: object
      required: [reportId]
      properties:
        reportId: { type: string, format: uuid }
    SignalementSummary:
      type: object
      required: [wordText, clueText, reason, count, latestAt]
      properties:
        wordText: { type: string }
        clueText: { type: string }
        reason: { $ref: '#/components/schemas/ReportReason' }
        count: { type: integer }
        latestNote: { type: string }
        latestAt: { type: string, format: date-time }
    SignalementListResponse:
      type: object
      required: [items]
      properties:
        items: { type: array, items: { $ref: '#/components/schemas/SignalementSummary' } }
    SignalementDecisionRequest:
      type: object
      required: [decision]
      properties:
        decision: { type: string, enum: [dismiss, action] }
  ```

- [ ] **Step 3: Lint.** Run the repo's OpenAPI lint (as CI does; e.g.
  `npx @redocly/cli lint survey/api/openapi.yaml` or the Makefile target).
  Expected: no errors.

- [ ] **Step 4: Commit.**
  ```bash
  git commit -s -m "feat(api-survey): schema for POST/GET /v1/signalements"
  ```

**PR gate:** open PR titled `feat(api-survey): player report schema`;
body names the workstream + that it ships the contract first. Merge on §6a
LGTM + green CI **before starting Wave 2**.

---

## Wave 2 — survey domain + persistence (PR 2)

*Depends on Wave 1 merged.* TDD; domain logic targets ~100% mutation
coverage. Gates: `ci` (Gradle build, tests, Spotless, Konsist).

### Task 2.1: `ReportReason` + `ReportId`

**Files:**
- Create: `survey/domain/src/main/kotlin/com/bliss/survey/domain/model/ReportReason.kt`
- Modify: `survey/domain/.../model/Ids.kt`

**Interfaces (produced):**
- `enum class ReportReason { MOT_OFFENSANT, DEFINITION_OFFENSANTE, ERREUR_SENS, ERREUR_GRAMMAIRE, DEFINITION_REVELE, AMBIGU, TROP_FACILE, TROP_DIFFICILE, AUTRE }`
  with `fun isHarm(): Boolean = this == MOT_OFFENSANT || this == DEFINITION_OFFENSANTE`.
- `@JvmInline value class ReportId(val value: UUID)`.

- [ ] **Step 1: Write `ReportReason.kt`** (mirror `FlagReason.kt` idiom):
  ```kotlin
  package com.bliss.survey.domain.model

  enum class ReportReason {
      MOT_OFFENSANT, DEFINITION_OFFENSANTE,
      ERREUR_SENS, ERREUR_GRAMMAIRE, DEFINITION_REVELE, AMBIGU,
      TROP_FACILE, TROP_DIFFICILE, AUTRE;

      fun isHarm(): Boolean = this == MOT_OFFENSANT || this == DEFINITION_OFFENSANTE
  }
  ```
- [ ] **Step 2: Add `ReportId`** to `Ids.kt` next to `RatingId`:
  `@JvmInline value class ReportId(val value: UUID)`.
- [ ] **Step 3: Build** `./gradlew :survey:domain:build --parallel`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(survey-domain): ReportReason + ReportId`.

### Task 2.2: `PlayerReport` aggregate (TDD)

**Files:**
- Create: `survey/domain/.../model/PlayerReport.kt`
- Test: `survey/domain/src/test/kotlin/com/bliss/survey/domain/model/PlayerReportTest.kt`

**Interfaces (produced):**
```kotlin
enum class ReportStatus { PENDING, DISMISSED, ACTIONED }
enum class ReportSurface { SOLO, DAILY, MULTIPLAYER, MINI_GAME }
data class PlayerReport(
    val id: ReportId,
    val wordText: String,
    val clueText: String,
    val reason: ReportReason,
    val note: String?,
    val puzzleId: UUID?,
    val surface: ReportSurface,
    val reporterId: UserId?,
    val status: ReportStatus,
    val createdAt: Instant,
    val triagedAt: Instant? = null,
    val triagedBy: UserId? = null,
)
```

- [ ] **Step 1: Write failing tests** (JUnit 5 + assertk):
  ```kotlin
  class PlayerReportTest {
      @Test fun `rejects blank wordText`() {
          assertFailure { report(wordText = " ") }.messageContains("wordText")
      }
      @Test fun `rejects note over 500 chars`() {
          assertFailure { report(note = "x".repeat(501)) }.messageContains("note")
      }
      @Test fun `harm reason is flagged`() {
          assertThat(report(reason = ReportReason.MOT_OFFENSANT).reason.isHarm()).isTrue()
      }
      @Test fun `defaults to pending`() {
          assertThat(report().status).isEqualTo(ReportStatus.PENDING)
      }
      // helper report(...) builds a valid PlayerReport with overridable fields
  }
  ```
- [ ] **Step 2: Run** `./gradlew :survey:domain:test --tests '*PlayerReportTest'`. Expected: FAIL (unresolved `PlayerReport`).
- [ ] **Step 3: Implement `PlayerReport.kt`** with `init { require(...) }`
  invariants (`wordText`/`clueText` non-blank, `note` length ≤ 500) mirroring
  `Rating.kt`.
- [ ] **Step 4: Run tests.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(survey-domain): PlayerReport aggregate`.

### Task 2.3: Repository port + in-memory fake

**Files:**
- Create: `survey/application/.../ports/SignalementRepository.kt`
- Modify: `survey/application/src/test/.../usecases/InMemoryRepositories.kt`

**Interfaces (produced):**
```kotlin
interface SignalementRepository {
    suspend fun insert(report: PlayerReport)
    suspend fun existsFor(reporterId: UserId, wordText: String, clueText: String): Boolean
    suspend fun listPending(): List<PlayerReport>
    suspend fun findById(id: ReportId): PlayerReport?
    suspend fun updateStatus(id: ReportId, status: ReportStatus, triagedBy: UserId, triagedAt: Instant)
    suspend fun anonymiseForUser(userId: UserId)
}
```

- [ ] **Step 1: Write the port interface** (signatures above).
- [ ] **Step 2: Add `InMemorySignalementRepository`** to the shared test
  fakes file, mirroring `InMemoryRatingRepository` (a `MutableList<PlayerReport>`;
  `anonymiseForUser` copies matching entries with `reporterId = null`).
- [ ] **Step 3: Build** `./gradlew :survey:application:build`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(survey-application): SignalementRepository port`.

### Task 2.4: Flyway migration + Postgres adapter

**Files:**
- Create: `survey/infrastructure/src/main/resources/db/migration/V12__player_reports.sql`
- Create: `survey/infrastructure/.../persistence/PgSignalementRepository.kt`

- [ ] **Step 1: Write the migration** (style from `V2__ratings.sql`;
  lowercase enum CHECKs):
  ```sql
  CREATE TABLE player_reports (
      report_id   UUID PRIMARY KEY,
      word_text   TEXT NOT NULL,
      clue_text   TEXT NOT NULL,
      reason      TEXT NOT NULL CHECK (reason IN ('mot_offensant','definition_offensante','erreur_sens','erreur_grammaire','definition_revele','ambigu','trop_facile','trop_difficile','autre')),
      note        TEXT,
      puzzle_id   UUID,
      surface     TEXT NOT NULL CHECK (surface IN ('solo','daily','multiplayer','mini_game')),
      reporter_id UUID,
      status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dismissed','actioned')),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      triaged_at  TIMESTAMPTZ,
      triaged_by  UUID
  );
  CREATE INDEX player_reports_pending ON player_reports (created_at) WHERE status = 'pending';
  CREATE UNIQUE INDEX player_reports_dedup ON player_reports (reporter_id, word_text, clue_text) WHERE reporter_id IS NOT NULL;
  ```
- [ ] **Step 2: Write `PgSignalementRepository.kt`** mirroring
  `PgRatingRepository` (`withContext(Dispatchers.IO) { withTxConnection(dataSource) { ... } }`;
  `reason.name.lowercase()`, `surface.name.lowercase()`, `status.name.lowercase()`;
  `existsFor` = `SELECT 1 ... LIMIT 1`; `anonymiseForUser` = `UPDATE player_reports SET reporter_id = NULL WHERE reporter_id = ?`).
- [ ] **Step 3: Build + migration test.** Run
  `./gradlew :survey:infrastructure:test --parallel` (uses the repo's
  Testcontainers/Flyway harness if present). Expected: PASS.
- [ ] **Step 4: Commit** `feat(survey-infrastructure): player_reports table + Pg adapter`.

**PR gate:** open PR `feat(survey): player report domain + persistence`;
merge on §6a LGTM + green CI before Wave 3.

---

## Wave 3 — capture endpoint + email + anonymize (PR 3)

*Depends on Wave 2 merged.* Includes an **auth/authz threat model in the PR
body** (optional-auth capture + maintainer-only surfaces). Gates: `ci`,
`openapi-typescript-drift` (no frontend change yet — n/a), `secret-scan`.

### Task 3.1: `EmailSender` port + Brevo adapter (TDD)

**Files:**
- Create: `survey/application/.../ports/EmailSender.kt`
- Create: `survey/infrastructure/.../email/SurveyBrevoEmailSender.kt`, `.../email/SurveyBrevoConfig.kt`
- Test: `survey/infrastructure/src/test/.../email/SurveyBrevoEmailSenderTest.kt`

**Interfaces (produced):**
```kotlin
fun interface EmailSender { suspend fun send(email: OutboundEmail) }
data class OutboundEmail(val to: String, val subject: String, val textBody: String, val htmlBody: String? = null)
```

- [ ] **Step 1: Write the port** (mirror billing `EmailSender.kt`).
- [ ] **Step 2: Write failing adapter test** with Ktor `MockEngine`:
  assert the request goes to `https://api.brevo.com/v3/smtp/email`, has
  header `api-key = <config.apiKey>`, and a JSON body containing the
  subject + `to`. (Mirror `BillingBrevoEmailSenderTest` if it exists.)
- [ ] **Step 3: Run** `./gradlew :survey:infrastructure:test --tests '*SurveyBrevoEmailSenderTest'`. Expected: FAIL.
- [ ] **Step 4: Implement `SurveyBrevoEmailSender`** (Ktor `HttpClient(engine)`,
  POST JSON, `header("api-key", config.apiKey)`; no vendor SDK) + `SurveyBrevoConfig(apiKey, maintainerAddress, senderAddress)`.
- [ ] **Step 5: Run tests.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(survey): Brevo EmailSender port + adapter`.

### Task 3.2: `SubmitSignalementUseCase` (TDD)

**Files:**
- Create: `survey/application/.../usecases/SubmitSignalementUseCase.kt`
- Test: `survey/application/src/test/.../usecases/SubmitSignalementUseCaseTest.kt`

**Interfaces (produced):**
```kotlin
sealed interface SubmitSignalementResult {
    data class Accepted(val reportId: ReportId) : SubmitSignalementResult
    data object DuplicateIgnored : SubmitSignalementResult
}
data class SubmitSignalementCommand(
    val wordText: String, val clueText: String, val reason: ReportReason,
    val note: String?, val puzzleId: UUID?, val surface: ReportSurface,
    val reporterId: UserId?,
)
class SubmitSignalementUseCase(
    private val reports: SignalementRepository,
    private val ids: IdGenerator, private val clock: Clock,
    private val email: EmailSender, private val tx: TransactionManager,
    private val maintainerAddress: String,
)
```

- [ ] **Step 1: Write failing tests** (fakes for all ports; `runTest`):
  - `persists a PENDING report and returns its id`
  - `authenticated duplicate (same reporter+word+clue) returns DuplicateIgnored and does not double-insert` (seed `existsFor = true`)
  - `harm reason sends one email to the maintainer address`
  - `quality reason sends no email`
  Use a `FakeEmailSender` recording calls; `Clock { fixedNow }`; an `object : IdGenerator`.
- [ ] **Step 2: Run** `./gradlew :survey:application:test --tests '*SubmitSignalementUseCaseTest'`. Expected: FAIL.
- [ ] **Step 3: Implement `execute`** — if `reporterId != null && reports.existsFor(...)` → `DuplicateIgnored`; else build `PlayerReport`, `tx.inTransaction { reports.insert(r) }`; if `reason.isHarm()` → `email.send(OutboundEmail(to = maintainerAddress, subject = "⚠ Signalement — ${reason} : ${wordText}", textBody = ...))`; return `Accepted(id)`.
- [ ] **Step 4: Run tests.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(survey-application): SubmitSignalementUseCase`.

### Task 3.3: DTOs + Ktor route (optional auth)

**Files:**
- Create: `survey/api/.../dto/SignalementDtos.kt`
- Create: `survey/api/.../routes/SubmitSignalementRoute.kt`
- Modify: `survey/api/.../Module.kt`, `survey/api/.../Wiring.kt`

- [ ] **Step 1: Write `@Serializable` DTOs** matching the schema
  (`SignalementRequest`, `SignalementResponse`) with kotlinx.serialization
  `@SerialName` lowercase enum values.
- [ ] **Step 2: Write the route** (mirror `SubmitRatingRoute.kt`, but
  **no** `requireContribuer()` — optional auth):
  ```kotlin
  fun Route.submitSignalementRoute(execute: suspend (SubmitSignalementCommand) -> SubmitSignalementResult) {
      post("/v1/signalements") {
          val body = call.receive<SignalementRequest>()
          val reporterId = call.attributes.getOrNull(UserIdKey)?.let { UserId(it) }
          val cmd = body.toCommand(reporterId)   // maps DTO enums → domain enums
          when (execute(cmd)) {
              is SubmitSignalementResult.Accepted -> call.respond(HttpStatusCode.Created, SignalementResponse(...))
              SubmitSignalementResult.DuplicateIgnored -> call.respond(HttpStatusCode.Created, /* idempotent */ ...)
          }
      }
  }
  fun Route.submitSignalementRoute(useCase: SubmitSignalementUseCase) =
      submitSignalementRoute { cmd -> useCase.execute(cmd) }
  ```
- [ ] **Step 3: Register** in `Module.kt` `routing { ... submitSignalementRoute(wiring.submitSignalement) }` and add `submitSignalement` + the `EmailSender`/config to `Wiring.kt`'s constructed graph.
- [ ] **Step 4: Route test** (Ktor `testApplication`): POST a body without a
  session cookie → `201` + a `reportId`; POST a harm reason → `201` and the
  fake email sender recorded one send. Run
  `./gradlew :survey:api:test --tests '*Signalement*'`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api-survey): POST /v1/signalements route`.

### Task 3.4: RGPD anonymize hook

**Files:**
- Modify: `survey/application/.../usecases/AnonymizeUserRatingsUseCase.kt` (+ constructor + its test)

- [ ] **Step 1: Add a failing assertion** to `AnonymizeUserRatingsUseCaseTest`:
  after `execute(userId)`, the injected `InMemorySignalementRepository`
  has that user's reports with `reporterId == null`.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Inject `SignalementRepository`** into the use case and call
  `signalements.anonymiseForUser(userId)` alongside the existing
  `ratings.anonymiseForUser(userId)`. Wire the new dependency in the
  infrastructure DI (`UserDeletedConsumer` construction).
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(survey): anonymise player reports on UserDeleted`.

### Task 3.5: Brevo secret + config wiring

**Files:**
- Modify: survey Helm chart (`infra/platform/charts/...` survey values + secret ref) and the app config reader for `SURVEY_BREVO_API_KEY`, `SURVEY_MAINTAINER_EMAIL`, `SURVEY_EMAIL_SENDER`.

- [ ] **Step 1: Add config keys** to survey's config loader (mirror how
  billing reads `BILLING_BREVO_*`). Never commit the key value (secret-scan).
- [ ] **Step 2: Add the k8s Secret ref + env** in the survey chart (mirror
  billing/identity Brevo secret wiring). Document the secret in
  `docs/secrets.md`.
- [ ] **Step 3: `helm lint`** the chart. Expected: PASS.
- [ ] **Step 4: Commit** `chore(survey): wire Brevo secret + maintainer email config`.

**PR gate:** PR `feat(survey): player report capture + harm email`; body
includes the **threat model**. Merge on §6a LGTM + green CI before Wave 4.

---

## Wave 4 — frontend capture + privacy (PR 4)

*Depends on Wave 3 merged (endpoint live).* First run `pnpm api:check` to
regenerate `survey/types.ts` from the merged schema. May invoke the
**standing cap-override** (one privacy workstream). Gates: `ci`,
`openapi-typescript-drift`, frontend `typecheck`/`test`, `a11y`.

### Task 4.1: Regenerate types + client method

**Files:**
- Modify: `frontend/src/infrastructure/api/survey/types.ts` (generated), `frontend/src/infrastructure/api/survey/client.ts`, `frontend/src/application/survey/types.ts`

- [ ] **Step 1: Regenerate types.** From `frontend/`: `pnpm api:check`.
  Confirm `SignalementRequest`/`SignalementResponse` appear in `types.ts`.
- [ ] **Step 2: Add `submitSignalement`** to the `SurveyClient` interface +
  `createHttpSurveyClient` (mirror `submitRating`): `POST ${base}/v1/signalements`,
  `credentials: 'include'`; on `429` throw a typed `ReportRateLimitedError`;
  `!res.ok` → throw. Return `{ reportId }`.
- [ ] **Step 3: Typecheck** `pnpm typecheck`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(frontend-survey): submitSignalement client`.

### Task 4.2: `useReportClue` hook (TDD)

**Files:**
- Create: `frontend/src/application/signalement/useReportClue.ts`
- Test: `frontend/tests/use-report-clue.test.ts`

- [ ] **Step 1: Failing test** — hook exposes `report(input)` that calls the
  client once, sets a `localStorage` guard key `signalement:${wordText}:${clueText}`,
  and refuses a second call for the same key (returns `already-reported`).
- [ ] **Step 2: Run** `pnpm test use-report-clue`. Expected: FAIL.
- [ ] **Step 3: Implement** the hook (inject client; guard via `localStorage`).
- [ ] **Step 4: Run** test. Expected: PASS. **Commit** `feat(frontend): useReportClue hook`.

### Task 4.3: Report bottom-sheet + panel button (TDD)

**Files:**
- Create: `frontend/src/ui/components/grid/ReportClueSheet.tsx`
- Modify: `frontend/src/ui/components/grid/CurrentCluePanel.tsx` (+ thread `wordText`/`surface` from parent grid)
- Test: `frontend/tests/report-clue-sheet.test.tsx`

- [ ] **Step 1: Failing test** (testing-library): rendering the panel shows
  a `data-testid="report-clue"` button; clicking opens a dialog listing the
  9 reasons + an optional note field + a submit; submitting calls
  `useReportClue.report` with the selected reason and shows the toast
  "Merci, c'est signalé". Include the point-of-collection notice line
  linking to `/confidentialite`.
- [ ] **Step 2: Run** `pnpm test report-clue-sheet`. Expected: FAIL.
- [ ] **Step 3: Implement `ReportClueSheet`** using the Ark `Dialog`
  primitive (`@/ui/components/primitives`), reason list from a typed
  `ReportReason[]` with fr labels (tutoiement), optional `<textarea>` note,
  submit → `report(...)`. Add the trigger button to `CurrentCluePanel`
  (only when a clue is active). Thread `wordText` + `surface` as new props
  from the parent grid (derive `wordText` from the clue's cell entries via
  `getEntryAt`).
- [ ] **Step 4: Run** test + `pnpm a11y` (dialog focus-trap/labels come from
  Ark). Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): report-clue bottom sheet`.

### Task 4.4: Wire into solo / multiplayer / mini-game

**Files:**
- Modify: the solo grid container, the multiplayer lobby grid, and the
  homescreen mini-game to pass `surface` (`solo`/`daily` per puzzle kind,
  `multiplayer`, `mini_game`) and `wordText` into `CurrentCluePanel`.

- [ ] **Step 1:** Pass the right `surface` + `wordText` at each of the three
  call sites (grep for `<CurrentCluePanel`).
- [ ] **Step 2:** Manual/browser check per the `verify` skill — the report
  button appears and submits in each mode. **Commit** `feat(frontend): enable report on all play surfaces`.

### Task 4.5: `/confidentialite` signalements section + i18n

**Files:**
- Modify: `frontend/src/ui/v2/ConfidentialiteScreen.tsx`, `frontend/src/ui/i18n/messages.fr.ts`
- Test: `frontend/tests/privacy-notice-sondage-section.test.tsx` (add a sibling assertion or a new `*-signalements-section.test.tsx`)

- [ ] **Step 1: Failing test** — `ConfidentialiteScreen` renders a section
  with heading `t('v2.confidentialite.signalements.heading')`.
- [ ] **Step 2: Add fr keys** under `v2.confidentialite.signalements.*`
  (what's collected: reported mot+définition, raison, note optionnelle, +
  compte si connecté; pourquoi: qualité des grilles, intérêt légitime;
  conservation; droits: anonymisé à la suppression du compte) and
  `signalement.*` (sheet labels + reason copy).
- [ ] **Step 3: Append the `<section className={contentCard}>`** in
  `ConfidentialiteScreen` mirroring the sondage section.
- [ ] **Step 4: Run** `pnpm test privacy-notice`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): /confidentialite signalements disclosure`.

**PR gate:** PR `feat(frontend): player report capture + privacy`. If over
400 lines, add the cap-override note (one privacy workstream) to the body.
Merge on §6a LGTM + green CI before Wave 5.

---

## Wave 5 — `/signalements` triage page (PR 5)

*Depends on Wave 4 merged.* Backend list/decision endpoints + maintainer
page. **Threat model in PR body** (maintainer-only surface). Gates: `ci`,
`openapi-typescript-drift`, frontend `typecheck`/`test`/`a11y`.

### Task 5.1: Backend list + decision use cases + routes

**Files:**
- Create: `survey/application/.../usecases/ListSignalementsUseCase.kt`, `.../usecases/DecideSignalementUseCase.kt`
- Create: `survey/api/.../routes/SignalementQueueRoute.kt` (GET list + POST decision)
- Modify: `Module.kt`, `Wiring.kt`

- [ ] **Step 1: Failing use-case tests** — `ListSignalementsUseCase`
  groups pending reports by `(wordText, clueText, reason)` with a count +
  latest note/time; `DecideSignalementUseCase` sets status `DISMISSED` or
  `ACTIONED` with `triagedBy`/`triagedAt` (fake repo).
- [ ] **Step 2: Run** `./gradlew :survey:application:test --tests '*Signalement*'`. Expected: FAIL.
- [ ] **Step 3: Implement** both use cases (list uses `reports.listPending()`
  + in-memory grouping; decide uses `findById` + `updateStatus`).
- [ ] **Step 4: Write the routes** gated with `requireContribuer()` (maintainer
  only), mirroring existing guarded routes; `GET /v1/signalements`,
  `POST /v1/signalements/{reportId}/decision`. Register in `Module.kt`/`Wiring.kt`.
- [ ] **Step 5: Route tests** — no cookie/non-maintainer → `403`; maintainer
  → `200`/`204`. Run `./gradlew :survey:api:test`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(survey): list + decide signalements (maintainer)`.

### Task 5.2: Client methods + `/signalements` gated route

**Files:**
- Modify: `frontend/src/infrastructure/api/survey/client.ts`, `frontend/src/application/survey/types.ts`
- Create: `frontend/src/ui/routes/signalements.tsx`, `frontend/src/ui/routes/signalements.lazy.tsx`
- Modify: `frontend/src/ui/router.ts`

- [ ] **Step 1:** Add `listSignalements()` + `decideSignalement(reportId, decision)` to the survey client (regenerate types via `pnpm api:check` first).
- [ ] **Step 2:** Create the route split mirroring `/contribuer`: eager
  `signalements.tsx` (`createRoute({ getParentRoute: () => RootRoute, path: '/signalements' }).lazy(...)`) and `signalements.lazy.tsx` whose component wraps the page in `useCapabilityGate('contribuer')` (loading → skeleton; denied → `<NotFoundScreen/>`; allowed → `<SignalementQueue/>`).
- [ ] **Step 3:** Register `SignalementsRoute` in `router.ts` `RootRoute.addChildren([... , SignalementsRoute])`.
- [ ] **Step 4:** `pnpm typecheck`. Expected: PASS. **Commit** `feat(frontend): /signalements gated route`.

### Task 5.3: `SignalementQueue` UI (TDD)

**Files:**
- Create: `frontend/src/ui/components/signalements/SignalementQueue.tsx`
- Test: `frontend/tests/signalement-queue.test.tsx`

- [ ] **Step 1: Failing test** — given a list response, renders one row per
  group (mot, clue, reason, count, latest note), harm reasons sorted first;
  a **Rejeter** button calls `decideSignalement(id, 'dismiss')`; a **Corriger**
  button opens the existing `CorrectifField` (import from
  `@/ui/components/sondage/CorrectifField`) prefilled with mot + current
  définition, whose submit path creates the correctif and then calls
  `decideSignalement(id, 'action')`.
- [ ] **Step 2: Run** `pnpm test signalement-queue`. Expected: FAIL.
- [ ] **Step 3: Implement** the queue (fetch on mount, group already grouped
  server-side, sort harm-first, wire the two actions; reuse `CorrectifField`).
- [ ] **Step 4: Run** test + `pnpm a11y`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): /signalements triage queue`.

**PR gate:** PR `feat(frontend): maintainer signalements triage`; threat
model in body. Merge on §6a LGTM + green CI. Feature complete.

---

## Self-Review

**Spec coverage** — every spec section maps to a task:
- Reason taxonomy → 1.2 (schema enum) + 2.1 (domain enum) + 4.3 (fr labels). ✔
- Data model `player_reports` → 2.2 (aggregate) + 2.4 (migration/adapter). ✔
- Capture endpoint (sync, optional auth, all surfaces) → 3.2/3.3 + 4.1–4.4. ✔
- Harm email (survey Brevo) → 3.1/3.2/3.5. ✔
- Triage `/signalements` (contribuer-gated, Corriger→correctif) → 5.1–5.3. ✔
- RGPD (anonymize on UserDeleted; `/confidentialite`; point-of-collection notice) → 3.4 + 4.5 + 4.3. ✔
- Governance (ADR-0101, schema-first, threat models) → 1.1/1.2, Wave 3 & 5 PR gates. ✔
- Non-goals (auto-takedown, auto-training, cross-guest dedup, purge job) → intentionally absent. ✔

**Placeholder scan** — no "TBD"/"handle edge cases" steps; every code step
shows code; test steps show assertions.

**Type consistency** — `PlayerReport`, `ReportReason` (+`isHarm`), `ReportId`,
`ReportStatus`, `ReportSurface`, `SignalementRepository` (with
`anonymiseForUser`, `existsFor`, `listPending`, `updateStatus`),
`SubmitSignalementUseCase`/`Command`/`Result`, `EmailSender`/`OutboundEmail`
are defined once (Wave 2/3) and referenced consistently downstream.
Wire enums lowercase; domain enums UPPER; DTO `@SerialName` bridges them.

**Known risk to watch:** report↔`survey_item` matching in Task 5.3's
"Corriger" is a text join on `(mot, définition)`; if no item exists the
correctif path must create one (existing `SubmitRatingUseCase` create-or-reuse
behavior) — the implementer must confirm `CorrectifField`'s submit reaches
that create path, not only an update.
