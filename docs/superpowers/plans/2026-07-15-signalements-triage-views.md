# Signalements Triage Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "dont vous" badge to pending report groups the maintainer authored, and a French **Historique** tab listing already-handled reports, on `/signalements`.

**Architecture:** Schema-first (ADR-0003): one schema-only PR, then survey-backend producer PR(s), then frontend consumer PR(s). Both features reuse existing `PlayerReport` fields (`reporterId`, `status`, `triagedAt`) — no DB migration. The badge is computed server-side by matching the authenticated caller's id against a group's reporters. The Historique tab is a new contribuer-gated `GET /v1/signalements/historique` endpoint plus an in-component tab (the route is admin-gated + noindex, so no per-tab prerender routes are needed).

**Tech Stack:** Kotlin/Ktor (survey context), Postgres (existing `player_reports` table), React 19 + TS + Panda CSS + TanStack Router (frontend), OpenAPI + openapi-typescript.

## Global Constraints

- **Schema-first (ADR-0003):** `survey/api/openapi.yaml` is the contract; never hand-edit `frontend/src/infrastructure/api/survey/types.ts` — regenerate with `pnpm api:generate`. The schema-only PR merges before producer/consumer PRs.
- **PR cap 400 lines** of diff (excluding generated code / blanks); one workstream per PR.
- **Branch:** `<type>/<desc>`; **commits:** conventional with bounded-context scope; **DCO:** every commit `-s`.
- **Contribuer gate (ADR-0079):** both list endpoints call `requireContribuer()`; `UserIdKey` is guaranteed set after the gate passes.
- **RGPD (ADR-0103):** anonymised reports have `reporterId = null` and must never match the "mine" badge.
- **Observability:** no `println`/`console.log`; structured logs only.
- **French for all user-facing surfaces**, including the API path (`/v1/signalements/historique`, not `handled`). Tab labels **À traiter** / **Historique**; badge **dont vous**; decision chips **Traité** / **Rejeté**.
- **TDD** for survey domain/application/infrastructure (tests first). The frontend has no component/API-client unit-test harness (4 unit tests total, no RTL); frontend tasks verify via `pnpm typecheck`, `pnpm api:check`, and `pnpm test` (existing suite stays green).
- **Backend tests use assertk + JUnit5 + `kotlinx.coroutines.test.runTest`**, mirroring existing survey tests.

---

## PR 1 — Schema only

### Task 1: Add `mine` field + `/v1/signalements/historique` to the OpenAPI contract and regenerate types

**Files:**
- Modify: `survey/api/openapi.yaml` (schema `SignalementSummary` ~line 766; add a path after `/v1/signalements/{reportId}/decision` ~line 400; add schemas after `SignalementListResponse` ~line 800)
- Modify (generated): `frontend/src/infrastructure/api/survey/types.ts`

**Interfaces:**
- Produces: OpenAPI schemas `SignalementSummary.mine: boolean`, `SignalementHistoryItem`, `SignalementHistoryResponse`, and operation `listHandledSignalements` at `GET /v1/signalements/historique`. Generated TS: `components['schemas']['SignalementSummary'].mine`, `components['schemas']['SignalementHistoryItem']`, `components['schemas']['SignalementHistoryResponse']`.

- [ ] **Step 1: Add `mine` to `SignalementSummary`**

In `survey/api/openapi.yaml`, in the `SignalementSummary` schema, add `mine` to `required` and to `properties`:

```yaml
      required: [reportId, wordText, clueText, reason, surface, puzzleId, count, latestNote, latestAt, mine]
```

Append under `properties` (after `latestAt`):

```yaml
        mine:
          type: boolean
          description: |
            True when the authenticated maintainer viewing the queue is among
            this group's reporters (ADR-0103). Lets them deprioritise their own
            reports. Anonymous and RGPD-anonymised reports never match.
```

- [ ] **Step 2: Add the `historique` path**

After the `/v1/signalements/{reportId}/decision` path block (before `/v1/health`), add:

```yaml
  /v1/signalements/historique:
    get:
      operationId: listHandledSignalements
      summary: List already-handled reports (maintainer only).
      description: |
        Contribuer-gated. Reports already triaged (dismissed or actioned),
        most-recently-triaged first, capped at a recent window. Flat list, not
        grouped — a decision acts on a single report (ADR-0103).
      tags: [signalements]
      security:
        - sessionCookie: []
      responses:
        '200':
          description: Handled reports, newest triaged first.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SignalementHistoryResponse' }
        '403': { $ref: '#/components/responses/ProblemDetails' }
```

- [ ] **Step 3: Add the history schemas**

After the `SignalementListResponse` schema, add:

```yaml
    SignalementHistoryItem:
      type: object
      description: A single already-triaged report (ADR-0103).
      required: [reportId, wordText, clueText, reason, surface, puzzleId, note, decision, triagedAt]
      properties:
        reportId:  { type: string, format: uuid }
        wordText:
          type: string
          nullable: true
          description: Server-resolved answer word; null when unresolved (ADR-0111).
        clueText:  { type: string }
        reason:    { $ref: '#/components/schemas/ReportReason' }
        surface:   { $ref: '#/components/schemas/ReportSurface' }
        puzzleId:
          type: string
          format: uuid
          nullable: true
          description: null for mini-game reports (ADR-0073).
        note:      { type: string, nullable: true, description: "null when the report carried no note." }
        decision:
          type: string
          enum: [dismiss, action]
          x-enum-varnames: [DISMISS, ACTION]
          description: "How it was triaged: dismiss = rejeté, action = traité."
        triagedAt: { type: string, format: date-time }

    SignalementHistoryResponse:
      type: object
      required: [items]
      properties:
        items:
          type: array
          items: { $ref: '#/components/schemas/SignalementHistoryItem' }
```

- [ ] **Step 4: Regenerate the frontend types**

Run: `cd frontend && pnpm api:generate`
Expected: `src/infrastructure/api/survey/types.ts` now contains `mine?` on `SignalementSummary` (actually required), `SignalementHistoryItem`, `SignalementHistoryResponse`, and `listHandledSignalements`.

- [ ] **Step 5: Verify lint + drift**

Run: `cd frontend && pnpm api:check`
Expected: exits 0 (no drift after regeneration). If a repo-level `openapi-lint` is available, run it; expected PASS.

- [ ] **Step 6: Commit**

```bash
git add survey/api/openapi.yaml frontend/src/infrastructure/api/survey/types.ts
git commit -s -m "feat(api-survey): add mine flag + historique endpoint to signalements schema"
```

---

## PR 2 — Survey backend (producer)

### Task 2: Compute `mine` in `ListSignalementsUseCase`

**Files:**
- Modify: `survey/application/src/main/kotlin/com/bliss/survey/application/usecases/ListSignalementsUseCase.kt`
- Test: `survey/application/src/test/kotlin/com/bliss/survey/application/usecases/ListSignalementsUseCaseTest.kt`

**Interfaces:**
- Produces: `SignalementGroup.mine: Boolean`; `ListSignalementsUseCase.execute(viewerId: UserId): List<SignalementGroup>`.
- Consumes: `PlayerReport.reporterId: UserId?`, `com.bliss.survey.domain.model.UserId`.

- [ ] **Step 1: Add the failing tests**

In `ListSignalementsUseCaseTest.kt`, add imports:

```kotlin
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import com.bliss.survey.domain.model.UserId
```

Add a viewer id and a `reporterId` param to the existing `report(...)` helper (add the parameter with a default and thread it into the `PlayerReport`):

```kotlin
    private val viewer = UserId(UUID.fromString("99999999-9999-7999-8999-999999999999"))
```

In the `report(...)` factory signature add `reporterId: UserId? = null,` and set `reporterId = reporterId,` in the returned `PlayerReport` (replacing the current hard-coded `reporterId = null`).

Then add:

```kotlin
    @Test
    fun `mine is true when the viewer is among the group reporters`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", reporterId = viewer)
            reports.reports += report("22222222-2222-7222-8222-222222222222", reporterId = null)

            assertThat(ListSignalementsUseCase(reports).execute(viewer).single().mine).isTrue()
        }

    @Test
    fun `mine is false when the group has no report from the viewer`() =
        runTest {
            val other = UserId(UUID.fromString("88888888-8888-7888-8888-888888888888"))
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", reporterId = other)

            assertThat(ListSignalementsUseCase(reports).execute(viewer).single().mine).isFalse()
        }

    @Test
    fun `mine is false for anonymised reports with a null reporter`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", reporterId = null)

            assertThat(ListSignalementsUseCase(reports).execute(viewer).single().mine).isFalse()
        }
```

Update every existing `.execute()` call in this file to `.execute(viewer)` (they don't assert on `mine`, so behaviour is unchanged).

- [ ] **Step 2: Run tests to verify they fail**

Run: `./gradlew :survey:application:test --tests "*ListSignalementsUseCaseTest*"`
Expected: FAIL — `execute` now takes a `UserId`; `mine` unresolved.

- [ ] **Step 3: Implement `mine`**

In `ListSignalementsUseCase.kt`, add `import com.bliss.survey.domain.model.UserId`. Add `val mine: Boolean,` to `SignalementGroup` (after `latestAt`). Change the signature and add the computation:

```kotlin
    suspend fun execute(viewerId: UserId): List<SignalementGroup> =
        reports
            .listPending()
            .groupBy { GroupKey(it.clueText, it.puzzleId, it.reason) }
            .map { (key, group) ->
                val latest = group.maxBy { it.createdAt }
                SignalementGroup(
                    reportId = latest.id,
                    wordText = latest.wordText,
                    clueText = key.clueText,
                    reason = key.reason,
                    surface = latest.surface,
                    puzzleId = key.puzzleId,
                    count = group.size,
                    latestNote = latest.note,
                    latestAt = latest.createdAt,
                    mine = group.any { it.reporterId == viewerId },
                )
            }.sortedByDescending { it.latestAt }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./gradlew :survey:application:test --tests "*ListSignalementsUseCaseTest*"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add survey/application/src/main/kotlin/com/bliss/survey/application/usecases/ListSignalementsUseCase.kt survey/application/src/test/kotlin/com/bliss/survey/application/usecases/ListSignalementsUseCaseTest.kt
git commit -s -m "feat(survey-application): flag maintainer's own reports in the queue"
```

### Task 3: Thread the viewer through the route + emit `mine` on the wire

**Files:**
- Modify: `survey/api/src/main/kotlin/com/bliss/survey/api/dto/SignalementDtos.kt`
- Modify: `survey/api/src/main/kotlin/com/bliss/survey/api/routes/SignalementQueueRoute.kt`
- Modify: `survey/api/src/main/kotlin/com/bliss/survey/api/Wiring.kt`
- Modify: `survey/api/src/main/kotlin/com/bliss/survey/api/Main.kt`
- Test: `survey/api/src/test/kotlin/com/bliss/survey/api/routes/SignalementQueueRouteTest.kt`

**Interfaces:**
- Consumes: `ListSignalementsUseCase.execute(viewerId)` (Task 2), `UserIdKey`, `MAINTAINER_ID` (test support).
- Produces: DTO `SignalementSummary.mine: Boolean`; `Wiring.listSignalements: suspend (UserId) -> List<SignalementGroup>`.

- [ ] **Step 1: Add the failing route test**

In `SignalementQueueRouteTest.kt`, add `import com.bliss.survey.domain.model.UserId`. Change the `report(...)` helper to accept a reporter and thread it (add param `reporterId: UUID? = null` and set `reporterId = reporterId?.let(::UserId)` in the `PlayerReport`). Then add:

```kotlin
    @Test
    fun `GET marks the maintainer's own report with mine true`() =
        testApplication {
            application { wire(FakeRepo(listOf(report(reporterId = MAINTAINER_ID)))) }
            val resp = client.get("/v1/signalements") { cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE) }
            assertThat(resp.bodyAsText()).contains("\"mine\":true")
        }

    @Test
    fun `GET marks a stranger's report with mine false`() =
        testApplication {
            val other = UUID.fromString("44444444-4444-7444-8444-444444444444")
            application { wire(FakeRepo(listOf(report(reporterId = other)))) }
            val resp = client.get("/v1/signalements") { cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE) }
            assertThat(resp.bodyAsText()).contains("\"mine\":false")
        }
```

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew :survey:api:test --tests "*SignalementQueueRouteTest*"`
Expected: FAIL — `wire` passes `list = { list.execute() }` (arity mismatch) and no `mine` on the wire.

- [ ] **Step 3: Add `mine` to the DTO**

In `SignalementDtos.kt`, add `val mine: Boolean,` to `SignalementSummary` (after `latestAt`).

- [ ] **Step 4: Read the viewer in the route and map `mine`**

In `SignalementQueueRoute.kt`, add imports `com.bliss.survey.api.auth.UserIdKey` is already imported for the decision path. Change the `list` parameter type and the GET handler:

```kotlin
fun Route.signalementQueueRoute(
    list: suspend (UserId) -> List<SignalementGroup>,
    decide: suspend (ReportId, SignalementDecision, UserId) -> DecideSignalementResult,
) {
    get("/v1/signalements") {
        if (!call.requireContribuer()) return@get
        val viewerId = UserId(call.attributes[UserIdKey])
        val items = list(viewerId).map { it.toSummary() }
        call.respond(HttpStatusCode.OK, SignalementListResponse(items = items))
    }
```

In the private `toSummary()` add `mine = mine,` (after `latestAt`).

- [ ] **Step 5: Update Wiring + Main**

In `Wiring.kt`, change:

```kotlin
    val listSignalements: suspend (UserId) -> List<SignalementGroup>,
```

In `Main.kt`, change the wiring lambda:

```kotlin
            listSignalements = { viewerId -> listSignalements.execute(viewerId) },
```

- [ ] **Step 6: Update the route test wiring**

In `SignalementQueueRouteTest.kt`, change `wire(...)`:

```kotlin
            signalementQueueRoute(
                list = { viewerId -> list.execute(viewerId) },
                decide = { id, decision, uid -> decide.decide(id, decision, uid, Instant.parse("2026-07-11T12:00:00Z")) },
            )
```

- [ ] **Step 7: Run to verify pass**

Run: `./gradlew :survey:api:test --tests "*SignalementQueueRouteTest*"`
Expected: PASS (including the pre-existing GET/POST tests).

- [ ] **Step 8: Commit**

```bash
git add survey/api/src/main/kotlin/com/bliss/survey/api survey/api/src/test/kotlin/com/bliss/survey/api/routes/SignalementQueueRouteTest.kt
git commit -s -m "feat(api-survey): expose mine on the signalements queue"
```

### Task 4: `listHandled` repository method

**Files:**
- Modify: `survey/application/src/main/kotlin/com/bliss/survey/application/ports/SignalementRepository.kt`
- Modify: `survey/infrastructure/src/main/kotlin/com/bliss/survey/infrastructure/persistence/PgSignalementRepository.kt`
- Modify: `survey/application/src/test/kotlin/com/bliss/survey/application/usecases/InMemoryRepositories.kt` (add impl)
- Modify: `survey/api/src/test/kotlin/com/bliss/survey/api/routes/SignalementQueueRouteTest.kt` (`FakeRepo` stub — keeps the api module compiling)
- Test: `survey/infrastructure/src/test/kotlin/com/bliss/survey/infrastructure/persistence/PgSignalementRepositoryTest.kt`

**Interfaces:**
- Produces: `SignalementRepository.listHandled(limit: Int): List<PlayerReport>` — non-pending reports, newest `triagedAt` first, capped at `limit`.

- [ ] **Step 1: Add the failing Pg test**

In `PgSignalementRepositoryTest.kt`, add:

```kotlin
    @Test
    fun `listHandled returns only non-pending reports, newest triaged first, capped`() =
        runTest {
            val actioned = report(id = UUID.randomUUID(), status = ReportStatus.ACTIONED)
            val dismissed = report(id = UUID.randomUUID(), status = ReportStatus.DISMISSED)
            val pending = report(id = UUID.randomUUID(), status = ReportStatus.PENDING)
            reports.insert(actioned)
            reports.insert(dismissed)
            reports.insert(pending)
            reports.updateStatus(actioned.id, ReportStatus.ACTIONED, triager, Instant.parse("2026-07-11T09:00:00Z"))
            reports.updateStatus(dismissed.id, ReportStatus.DISMISSED, triager, Instant.parse("2026-07-11T11:00:00Z"))

            val handled = reports.listHandled(10)

            assertThat(handled.map { it.id }).containsExactly(dismissed.id, actioned.id)
            assertThat(reports.listHandled(1)).hasSize(1)
        }
```

If `triager` / `containsExactly` / `hasSize` are not already imported/defined in the file, add `import assertk.assertions.containsExactly`, `import assertk.assertions.hasSize`, and reuse the existing `triager` `UserId` used by the `updateStatus` test (search the file — it is defined there; if it is a local `val` inside a test, promote it to a class-level `private val triager = UserId(UUID.fromString("55555555-5555-7555-8555-555555555555"))`).

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew :survey:infrastructure:test --tests "*PgSignalementRepositoryTest*"`
Expected: FAIL — `listHandled` unresolved.

- [ ] **Step 3: Add to the port**

In `SignalementRepository.kt`, add (after `listPending`):

```kotlin
    /** Already-triaged reports (dismissed or actioned), newest triagedAt first, capped at [limit]. */
    suspend fun listHandled(limit: Int): List<PlayerReport>
```

- [ ] **Step 4: Implement in Postgres**

In `PgSignalementRepository.kt`, add the method (mirror `listPending`):

```kotlin
    override suspend fun listHandled(limit: Int): List<PlayerReport> =
        withContext(Dispatchers.IO) {
            withTxConnection(dataSource) { conn ->
                conn.prepareStatement(LIST_HANDLED_SQL).use { stmt ->
                    stmt.setInt(1, limit)
                    val out = mutableListOf<PlayerReport>()
                    stmt.executeQuery().use { rs -> while (rs.next()) out += rs.toPlayerReport() }
                    out
                }
            }
        }
```

Add to the `companion object`:

```kotlin
        const val LIST_HANDLED_SQL =
            "SELECT * FROM player_reports WHERE status <> 'pending' ORDER BY triaged_at DESC LIMIT ?"
```

- [ ] **Step 5: Implement in the in-memory + fake repos**

In `InMemoryRepositories.kt` `InMemorySignalementRepository`, add (after `listPending`):

```kotlin
    override suspend fun listHandled(limit: Int): List<PlayerReport> =
        reports
            .filter { it.status != ReportStatus.PENDING }
            .sortedByDescending { it.triagedAt ?: Instant.MIN }
            .take(limit)
```

In `SignalementQueueRouteTest.kt` `FakeRepo`, add a stub so the api test module compiles (Task 6 exercises it for real):

```kotlin
        override suspend fun listHandled(limit: Int): List<PlayerReport> =
            reports.filter { it.status != ReportStatus.PENDING }.sortedByDescending { it.triagedAt ?: Instant.MIN }.take(limit)
```

- [ ] **Step 6: Run to verify pass**

Run: `./gradlew :survey:infrastructure:test --tests "*PgSignalementRepositoryTest*" :survey:application:test :survey:api:test`
Expected: PASS (all three modules compile and pass).

- [ ] **Step 7: Commit**

```bash
git add survey/application/src/main survey/infrastructure/src survey/application/src/test/kotlin/com/bliss/survey/application/usecases/InMemoryRepositories.kt survey/api/src/test/kotlin/com/bliss/survey/api/routes/SignalementQueueRouteTest.kt
git commit -s -m "feat(survey-infrastructure): list already-handled reports"
```

### Task 5: `ListHandledSignalementsUseCase`

**Files:**
- Create: `survey/application/src/main/kotlin/com/bliss/survey/application/usecases/ListHandledSignalementsUseCase.kt`
- Test: `survey/application/src/test/kotlin/com/bliss/survey/application/usecases/ListHandledSignalementsUseCaseTest.kt`

**Interfaces:**
- Consumes: `SignalementRepository.listHandled(limit)`, `SignalementDecision` (from `DecideSignalementUseCase.kt`).
- Produces: `data class SignalementHistoryRow(reportId: ReportId, wordText: String?, clueText: String, reason: ReportReason, surface: ReportSurface, puzzleId: UUID?, note: String?, decision: SignalementDecision, triagedAt: Instant)`; `ListHandledSignalementsUseCase.execute(): List<SignalementHistoryRow>`.

- [ ] **Step 1: Write the failing test**

Create `ListHandledSignalementsUseCaseTest.kt`:

```kotlin
package com.bliss.survey.application.usecases

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.isEqualTo
import com.bliss.survey.domain.model.PlayerReport
import com.bliss.survey.domain.model.ReportId
import com.bliss.survey.domain.model.ReportReason
import com.bliss.survey.domain.model.ReportStatus
import com.bliss.survey.domain.model.ReportSurface
import com.bliss.survey.domain.model.UserId
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class ListHandledSignalementsUseCaseTest {
    private val triager = UserId(UUID.fromString("55555555-5555-7555-8555-555555555555"))

    private fun handled(
        id: String,
        status: ReportStatus,
        triagedAt: Instant,
    ) = PlayerReport(
        id = ReportId(UUID.fromString(id)),
        wordText = "CHAT",
        clueText = "Animal qui miaule",
        reason = ReportReason.ERREUR_SENS,
        note = "note",
        puzzleId = null,
        surface = ReportSurface.SOLO,
        reporterId = null,
        status = status,
        createdAt = Instant.parse("2026-07-11T08:00:00Z"),
        triagedAt = triagedAt,
        triagedBy = triager,
    )

    @Test
    fun `maps actioned to action and dismissed to dismiss, newest first`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += handled("11111111-1111-7111-8111-111111111111", ReportStatus.ACTIONED, Instant.parse("2026-07-11T09:00:00Z"))
            reports.reports += handled("22222222-2222-7222-8222-222222222222", ReportStatus.DISMISSED, Instant.parse("2026-07-11T11:00:00Z"))

            val rows = ListHandledSignalementsUseCase(reports).execute()

            assertThat(rows.map { it.decision }).containsExactly(SignalementDecision.DISMISS, SignalementDecision.ACTION)
            assertThat(rows.first().triagedAt).isEqualTo(Instant.parse("2026-07-11T11:00:00Z"))
        }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew :survey:application:test --tests "*ListHandledSignalementsUseCaseTest*"`
Expected: FAIL — `ListHandledSignalementsUseCase` / `SignalementHistoryRow` unresolved.

- [ ] **Step 3: Implement**

Create `ListHandledSignalementsUseCase.kt`:

```kotlin
package com.bliss.survey.application.usecases

import com.bliss.survey.application.ports.SignalementRepository
import com.bliss.survey.domain.model.PlayerReport
import com.bliss.survey.domain.model.ReportId
import com.bliss.survey.domain.model.ReportReason
import com.bliss.survey.domain.model.ReportStatus
import com.bliss.survey.domain.model.ReportSurface
import java.time.Instant
import java.util.UUID

data class SignalementHistoryRow(
    val reportId: ReportId,
    val wordText: String?,
    val clueText: String,
    val reason: ReportReason,
    val surface: ReportSurface,
    val puzzleId: UUID?,
    val note: String?,
    val decision: SignalementDecision,
    val triagedAt: Instant,
)

class ListHandledSignalementsUseCase(
    private val reports: SignalementRepository,
) {
    suspend fun execute(): List<SignalementHistoryRow> =
        reports.listHandled(HANDLED_LIMIT).map { it.toHistoryRow() }

    private fun PlayerReport.toHistoryRow(): SignalementHistoryRow =
        SignalementHistoryRow(
            reportId = id,
            wordText = wordText,
            clueText = clueText,
            reason = reason,
            surface = surface,
            puzzleId = puzzleId,
            note = note,
            decision =
                when (status) {
                    ReportStatus.ACTIONED -> SignalementDecision.ACTION
                    ReportStatus.DISMISSED -> SignalementDecision.DISMISS
                    ReportStatus.PENDING -> error("listHandled returned a pending report")
                },
            triagedAt = requireNotNull(triagedAt) { "handled report must have triagedAt" },
        )

    private companion object {
        const val HANDLED_LIMIT = 100
    }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `./gradlew :survey:application:test --tests "*ListHandledSignalementsUseCaseTest*"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add survey/application/src/main/kotlin/com/bliss/survey/application/usecases/ListHandledSignalementsUseCase.kt survey/application/src/test/kotlin/com/bliss/survey/application/usecases/ListHandledSignalementsUseCaseTest.kt
git commit -s -m "feat(survey-application): map handled reports to history rows"
```

### Task 6: `GET /v1/signalements/historique` route

**Files:**
- Create: `survey/api/src/main/kotlin/com/bliss/survey/api/routes/SignalementHistoryRoute.kt`
- Modify: `survey/api/src/main/kotlin/com/bliss/survey/api/dto/SignalementDtos.kt`
- Modify: `survey/api/src/main/kotlin/com/bliss/survey/api/Wiring.kt`
- Modify: `survey/api/src/main/kotlin/com/bliss/survey/api/Module.kt`
- Modify: `survey/api/src/main/kotlin/com/bliss/survey/api/Main.kt`
- Test: `survey/api/src/test/kotlin/com/bliss/survey/api/routes/SignalementHistoryRouteTest.kt`

**Interfaces:**
- Consumes: `ListHandledSignalementsUseCase.execute()`, `SignalementHistoryRow`, `requireContribuer()`.
- Produces: `Wiring.listHandledSignalements: suspend () -> List<SignalementHistoryRow>`; DTOs `SignalementHistoryItem`, `SignalementHistoryResponse`; route function `Route.signalementHistoryRoute(listHandled)`.

- [ ] **Step 1: Write the failing route test**

Create `SignalementHistoryRouteTest.kt` (mirror the queue route test's `FakeRepo` + `wire` + capability setup):

```kotlin
package com.bliss.survey.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import com.bliss.survey.api.auth.SESSION_COOKIE_NAME
import com.bliss.survey.application.ports.SignalementRepository
import com.bliss.survey.application.usecases.ListHandledSignalementsUseCase
import com.bliss.survey.domain.model.PlayerReport
import com.bliss.survey.domain.model.ReportId
import com.bliss.survey.domain.model.ReportReason
import com.bliss.survey.domain.model.ReportStatus
import com.bliss.survey.domain.model.ReportSurface
import com.bliss.survey.domain.model.UserId
import io.ktor.client.request.cookie
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class SignalementHistoryRouteTest {
    private class FakeRepo(seed: List<PlayerReport> = emptyList()) : SignalementRepository {
        val reports = seed.toMutableList()

        override suspend fun insert(report: PlayerReport): Boolean = reports.add(report)

        override suspend fun findExisting(reporterId: UserId, clueText: String, puzzleId: UUID?): ReportId? = null

        override suspend fun listPending(): List<PlayerReport> = reports.filter { it.status == ReportStatus.PENDING }

        override suspend fun findById(id: ReportId): PlayerReport? = reports.firstOrNull { it.id == id }

        override suspend fun updateStatus(id: ReportId, status: ReportStatus, triagedBy: UserId, triagedAt: Instant) {}

        override suspend fun anonymiseForUser(userId: UserId) {}

        override suspend fun listHandled(limit: Int): List<PlayerReport> =
            reports.filter { it.status != ReportStatus.PENDING }.sortedByDescending { it.triagedAt ?: Instant.MIN }.take(limit)
    }

    private fun handled(id: UUID) = PlayerReport(
        id = ReportId(id),
        wordText = "CHAT",
        clueText = "Animal qui miaule",
        reason = ReportReason.ERREUR_SENS,
        note = "note",
        puzzleId = null,
        surface = ReportSurface.SOLO,
        reporterId = null,
        status = ReportStatus.ACTIONED,
        createdAt = Instant.parse("2026-07-11T08:00:00Z"),
        triagedAt = Instant.parse("2026-07-11T09:00:00Z"),
        triagedBy = UserId(MAINTAINER_ID),
    )

    private fun io.ktor.server.application.Application.wire(repo: FakeRepo) {
        installCapabilitySession()
        install(ContentNegotiation) { json() }
        val listHandled = ListHandledSignalementsUseCase(repo)
        routing { signalementHistoryRoute(listHandled = { listHandled.execute() }) }
    }

    @Test
    fun `GET without a cookie is 403`() =
        testApplication {
            application { wire(FakeRepo(listOf(handled(UUID.randomUUID())))) }
            assertThat(client.get("/v1/signalements/historique").status).isEqualTo(HttpStatusCode.Forbidden)
        }

    @Test
    fun `GET as a maintainer is 200 with the handled decision`() =
        testApplication {
            application { wire(FakeRepo(listOf(handled(UUID.fromString("11111111-1111-7111-8111-111111111111"))))) }
            val resp = client.get("/v1/signalements/historique") { cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE) }
            assertThat(resp.status).isEqualTo(HttpStatusCode.OK)
            assertThat(resp.bodyAsText()).contains("\"decision\":\"action\"")
        }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew :survey:api:test --tests "*SignalementHistoryRouteTest*"`
Expected: FAIL — `signalementHistoryRoute` / DTOs unresolved.

- [ ] **Step 3: Add the DTOs**

In `SignalementDtos.kt`, append:

```kotlin
@Serializable
data class SignalementHistoryItem(
    val reportId: String,
    val wordText: String?,
    val clueText: String,
    val reason: String,
    val surface: String,
    val puzzleId: String?,
    val note: String?,
    // "dismiss" (rejeté) or "action" (traité).
    val decision: String,
    val triagedAt: String,
)

@Serializable
data class SignalementHistoryResponse(
    val items: List<SignalementHistoryItem>,
)
```

- [ ] **Step 4: Create the route**

Create `SignalementHistoryRoute.kt`:

```kotlin
package com.bliss.survey.api.routes

import com.bliss.survey.api.dto.SignalementHistoryItem
import com.bliss.survey.api.dto.SignalementHistoryResponse
import com.bliss.survey.api.requireContribuer
import com.bliss.survey.application.usecases.SignalementDecision
import com.bliss.survey.application.usecases.SignalementHistoryRow
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

// Maintainer-only handled-report history (ADR-0079 + ADR-0103); gates on requireContribuer().
fun Route.signalementHistoryRoute(
    listHandled: suspend () -> List<SignalementHistoryRow>,
) {
    get("/v1/signalements/historique") {
        if (!call.requireContribuer()) return@get
        val items = listHandled().map { it.toHistoryItem() }
        call.respond(HttpStatusCode.OK, SignalementHistoryResponse(items = items))
    }
}

private fun SignalementHistoryRow.toHistoryItem(): SignalementHistoryItem =
    SignalementHistoryItem(
        reportId = reportId.value.toString(),
        wordText = wordText,
        clueText = clueText,
        reason = reason.name.lowercase(),
        surface = surface.name.lowercase(),
        puzzleId = puzzleId?.toString(),
        note = note,
        decision = when (decision) {
            SignalementDecision.DISMISS -> "dismiss"
            SignalementDecision.ACTION -> "action"
        },
        triagedAt = triagedAt.toString(),
    )
```

- [ ] **Step 5: Wire it**

In `Wiring.kt`, add the import `com.bliss.survey.application.usecases.SignalementHistoryRow` and the field:

```kotlin
    val listHandledSignalements: suspend () -> List<SignalementHistoryRow>,
```

In `Module.kt`, add `import com.bliss.survey.api.routes.signalementHistoryRoute` and register it next to the queue route:

```kotlin
        signalementHistoryRoute(wiring.listHandledSignalements)
```

In `Main.kt`, add `import com.bliss.survey.application.usecases.ListHandledSignalementsUseCase`, construct the use case beside the others, and add the wiring lambda:

```kotlin
    val listHandled = ListHandledSignalementsUseCase(signalements)
```
```kotlin
            listHandledSignalements = { listHandled.execute() },
```

- [ ] **Step 6: Run to verify pass**

Run: `./gradlew :survey:api:test --tests "*SignalementHistoryRouteTest*" :survey:api:test`
Expected: PASS.

- [ ] **Step 7: Full build + Spotless + Konsist**

Run: `./gradlew :survey:api:build :survey:application:build :survey:infrastructure:build spotlessCheck --parallel`
Expected: BUILD SUCCESSFUL. (If Spotless flags formatting, run `./gradlew spotlessApply` and re-commit.)

- [ ] **Step 8: Commit**

```bash
git add survey/api/src
git commit -s -m "feat(api-survey): serve the handled-reports history endpoint"
```

---

## PR 3 — Frontend (consumer)

> Depends on PR 1 (types) merged, and PR 2 deployed before this reaches prod (the consumer reads `mine` / the historique endpoint).

### Task 7: Application types + client adapter

**Files:**
- Modify: `frontend/src/application/survey/types.ts`
- Modify: `frontend/src/application/survey/index.ts`
- Modify: `frontend/src/infrastructure/api/survey/client.ts`

**Interfaces:**
- Produces: `SignalementSummary.mine: boolean`; `SignalementHistoryItem`; `SurveyClient.listHandledSignalements(): Promise<ReadonlyArray<SignalementHistoryItem>>`.

- [ ] **Step 1: Extend the application types**

In `frontend/src/application/survey/types.ts`, add `readonly mine: boolean;` to `SignalementSummary` (after `latestAt`). Add a new interface (near `SignalementSummary`):

```ts
export interface SignalementHistoryItem {
  readonly reportId: string;
  readonly wordText: string | null;
  readonly clueText: string;
  readonly reason: ReportReason;
  readonly surface: ReportSurface;
  readonly puzzleId: string | null;
  readonly note: string | null;
  readonly decision: SignalementDecision;
  readonly triagedAt: string;
}
```

Add to the `SurveyClient` interface (after `listSignalements`):

```ts
  listHandledSignalements(): Promise<ReadonlyArray<SignalementHistoryItem>>;
```

- [ ] **Step 2: Export the new type**

In `frontend/src/application/survey/index.ts`, add `SignalementHistoryItem,` to the `export type { ... } from './types';` block (keep alphabetical: after `SignalementDecision`).

- [ ] **Step 3: Implement in the client adapter**

In `frontend/src/infrastructure/api/survey/client.ts`, add `SignalementHistoryItem,` to the type import block (line ~11). In the `listSignalements` mapping, add `mine: it.mine,` (after `latestAt`). Add a new method after `listSignalements`:

```ts
  const listHandledSignalements: SurveyClient['listHandledSignalements'] = async () => {
    const res = await fetchImpl(`${base}/v1/signalements/historique`, { credentials: 'include' });
    if (res.status === 403) throw new ContribuerForbiddenError();
    if (!res.ok) throw new Error(`listHandledSignalements failed: ${res.status}`);
    const json = (await res.json()) as components['schemas']['SignalementHistoryResponse'];
    return json.items.map(
      (it): SignalementHistoryItem => ({
        reportId: it.reportId,
        wordText: it.wordText,
        clueText: it.clueText,
        reason: it.reason,
        surface: it.surface,
        puzzleId: it.puzzleId,
        note: it.note,
        decision: it.decision,
        triagedAt: it.triagedAt,
      }),
    );
  };
```

Add `listHandledSignalements,` to the returned object (after `listSignalements`).

- [ ] **Step 4: Typecheck**

Run: `cd frontend && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/application/survey frontend/src/infrastructure/api/survey/client.ts
git commit -s -m "feat(frontend-survey): client for mine flag + handled history"
```

### Task 8: "dont vous" badge + i18n

**Files:**
- Modify: `frontend/src/ui/components/signalements/SignalementQueue.tsx`
- Modify: `frontend/src/ui/i18n/messages.fr.ts`

**Interfaces:**
- Consumes: `SignalementSummary.mine` (Task 7).

- [ ] **Step 1: Add the i18n key**

In `messages.fr.ts`, after `'route.signalements.harmBadge'`, add:

```ts
  'route.signalements.mineBadge': "dont vous",
```

- [ ] **Step 2: Render the badge**

In `SignalementQueue.tsx`, add a badge style near `harmBadgeStyles`:

```ts
const mineBadgeStyles = css({
  fontFamily: 'wsUi',
  fontSize: '11px',
  fontWeight: 'black',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'ws.khaki',
});
```

In the `rowTopStyles` block, after the harm badge, add:

```tsx
                  {s.mine ? <span className={mineBadgeStyles}>{t('route.signalements.mineBadge')}</span> : null}
```

- [ ] **Step 3: Typecheck + existing tests**

Run: `cd frontend && pnpm typecheck && pnpm test`
Expected: PASS (i18n `t.test.ts` stays green with the added key).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/ui/components/signalements/SignalementQueue.tsx frontend/src/ui/i18n/messages.fr.ts
git commit -s -m "feat(frontend-survey): badge your own reports in the queue"
```

### Task 9: Historique tab + history list

**Files:**
- Create: `frontend/src/ui/components/signalements/SignalementHistory.tsx`
- Modify: `frontend/src/ui/routes/signalements.lazy.tsx`
- Modify: `frontend/src/ui/i18n/messages.fr.ts`

**Interfaces:**
- Consumes: `SurveyClient.listHandledSignalements()`, `SignalementHistoryItem`, `SegmentedControl`, `longDateFr`.

- [ ] **Step 1: Add the i18n keys**

In `messages.fr.ts`, after the mine badge key, add:

```ts
  'route.signalements.tabsAria': "Choisir la vue des signalements",
  'route.signalements.onglet.aTraiter': "À traiter",
  'route.signalements.onglet.historique': "Historique",
  'route.signalements.history.empty': "Aucun signalement traité pour le moment.",
  'route.signalements.history.decision.action': "Traité",
  'route.signalements.history.decision.dismiss': "Rejeté",
  'route.signalements.history.triagedAt': "Traité le {{date}}",
```

- [ ] **Step 2: Create the history component**

Create `frontend/src/ui/components/signalements/SignalementHistory.tsx`:

```tsx
// Read-only handled-report history (ADR-0103); contribuer-gated upstream.

import { useEffect, useState } from 'react';
import { css } from 'styled-system/css';
import { t } from '@/ui/i18n';
import { longDateFr } from '@/ui/v2/dailyCalendarModel';
import type { ReportReason, ReportSurface, SignalementHistoryItem, SurveyClient } from '@/application/survey';

const reasonLabelKey = {
  mot_offensant: 'signalement.reason.mot_offensant',
  definition_offensante: 'signalement.reason.definition_offensante',
  erreur_sens: 'signalement.reason.erreur_sens',
  erreur_grammaire: 'signalement.reason.erreur_grammaire',
  definition_revele: 'signalement.reason.definition_revele',
  ambigu: 'signalement.reason.ambigu',
  trop_facile: 'signalement.reason.trop_facile',
  trop_difficile: 'signalement.reason.trop_difficile',
  autre: 'signalement.reason.autre',
} as const satisfies Record<ReportReason, string>;

const surfaceLabelKey = {
  solo: 'route.signalements.surface.solo',
  daily: 'route.signalements.surface.daily',
  multiplayer: 'route.signalements.surface.multiplayer',
  mini_game: 'route.signalements.surface.mini_game',
} as const satisfies Record<ReportSurface, string>;

const stackStyles = css({ display: 'flex', flexDirection: 'column', gap: '16px' });
const statusStyles = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'semibold', color: 'ws.khaki', margin: 0 });
const alertStyles = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'bold', color: 'ws.sakuraDark', margin: 0 });
const listStyles = css({ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' });
const rowStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '16px',
  borderRadius: '18px',
  bg: 'ws.card',
  boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)',
});
const rowTopStyles = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px' });
const motStyles = css({ fontFamily: 'wsDisplay', fontSize: '18px', fontWeight: 'semibold', color: 'ws.jadeInk' });
const clueStyles = css({ fontFamily: 'wsUi', fontSize: '15px', color: 'ws.jadeInk', margin: 0 });
const metaStyles = css({ fontFamily: 'wsUi', fontSize: '12.5px', fontWeight: 'semibold', color: 'ws.khaki', margin: 0 });
const chipBase = { fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'black', letterSpacing: '0.04em', textTransform: 'uppercase' } as const;
const actionChip = css({ ...chipBase, color: 'ws.jadeInk' });
const dismissChip = css({ ...chipBase, color: 'ws.khaki' });

export interface SignalementHistoryProps {
  readonly surveyClient: SurveyClient;
}

export function SignalementHistory({ surveyClient }: SignalementHistoryProps) {
  const [items, setItems] = useState<ReadonlyArray<SignalementHistoryItem> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    surveyClient
      .listHandledSignalements()
      .then((list) => {
        if (alive) setItems(list);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [surveyClient]);

  return (
    <div className={stackStyles}>
      {items === null && !error ? <p className={statusStyles} role="status">{t('common.loading')}</p> : null}
      {error ? <p className={alertStyles} role="alert">{t('route.signalements.error')}</p> : null}
      {items !== null && items.length === 0 ? <p className={statusStyles}>{t('route.signalements.history.empty')}</p> : null}

      {items !== null && items.length > 0 ? (
        <ul className={listStyles}>
          {items.map((h) => {
            const decided = h.decision === 'action' ? t('route.signalements.history.decision.action') : t('route.signalements.history.decision.dismiss');
            return (
              <li key={h.reportId} className={rowStyles} data-testid="signalement-history-row">
                <div className={rowTopStyles}>
                  {h.wordText ? <span className={motStyles}>{h.wordText}</span> : null}
                  <span className={h.decision === 'action' ? actionChip : dismissChip}>{decided}</span>
                </div>
                <p className={clueStyles}>{h.clueText}</p>
                <p className={metaStyles}>
                  {t(reasonLabelKey[h.reason])} · {t(surfaceLabelKey[h.surface])} · {t('route.signalements.history.triagedAt', { date: longDateFr(h.triagedAt.slice(0, 10)) })}
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Add the tab shell to the route**

In `frontend/src/ui/routes/signalements.lazy.tsx`, add imports:

```tsx
import { useState } from 'react';
import { SegmentedControl } from '@/ui/v2/SegmentedControl';
import { SignalementHistory } from '@/ui/components/signalements/SignalementHistory';
```

Add the onglet model (module scope, after the style consts):

```tsx
type SignalementsOnglet = 'a-traiter' | 'historique';

const ONGLETS: ReadonlyArray<{ readonly id: SignalementsOnglet; readonly label: string }> = [
  { id: 'a-traiter', label: t('route.signalements.onglet.aTraiter') },
  { id: 'historique', label: t('route.signalements.onglet.historique') },
];

const tabBar = css({ margin: '0 0 16px' });
```

Replace the `SignalementsPage` body's conditional with tab state:

```tsx
function SignalementsPage() {
  const ctx = ParentRoute.useRouteContext();
  const surveyClient = ctx.surveyClient;
  const [onglet, setOnglet] = useState<SignalementsOnglet>('a-traiter');
  return (
    <AppShell variant="flow" topBar={<BackHeader to="/" />} backTo="/">
      <h1 className={title}>{t('route.signalements.heading')}</h1>
      {surveyClient ? (
        <>
          <SegmentedControl
            className={tabBar}
            ariaLabel={t('route.signalements.tabsAria')}
            options={ONGLETS}
            value={onglet}
            onChange={setOnglet}
          />
          {onglet === 'a-traiter' ? (
            <SignalementQueue surveyClient={surveyClient} correctionClient={ctx.correctionClient} />
          ) : (
            <SignalementHistory surveyClient={surveyClient} />
          )}
        </>
      ) : (
        <p className={alert} role="alert">{t('route.signalements.error')}</p>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 4: Typecheck + tests**

Run: `cd frontend && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 5: Manual verification (verify skill)**

Drive the running app to `/signalements` as a maintainer: confirm the **À traiter** / **Historique** tabs render, the queue shows a **dont vous** badge on a group you reported, and **Historique** lists handled reports with **Traité**/**Rejeté** chips and a French date. (Use the `run` / `verify` skills; admin auth required.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui/components/signalements/SignalementHistory.tsx frontend/src/ui/routes/signalements.lazy.tsx frontend/src/ui/i18n/messages.fr.ts
git commit -s -m "feat(frontend-survey): add the Historique tab to /signalements"
```

---

## PR mapping & sequencing

- **PR 1** = Task 1 (schema-only; gates `openapi-lint`, `openapi-typescript-drift`). Merges first.
- **PR 2** = Tasks 2–6 (survey backend). If the diff exceeds 400 lines, split into **PR 2a** (Tasks 2–3, mine) and **PR 2b** (Tasks 4–6, historique) — they are independent.
- **PR 3** = Tasks 7–9 (frontend). If over cap, split into **PR 3a** (Tasks 7–8, mine badge) and **PR 3b** (Tasks 7 shared + 9, historique). PR 3 relies on PR 2 being deployed for live data.
- Before any task, run `scripts/adr-context.sh` on the paths it touches (ADR-0079, 0103, 0056, 0003, 0111) and read the matches.

## Self-review notes

- **Spec coverage:** badge "includes mine" → Tasks 2–3, 7–8; order unchanged → Task 2 keeps `sortedByDescending { latestAt }`; Historique flat list newest-first + cap 100 → Tasks 4–6, 9; French API path/labels → Tasks 1, 6, 9; out-of-scope items (decision quirk, history `mine`, reordering) untouched.
- **Type consistency:** `SignalementHistoryRow` (application) → `SignalementHistoryItem` (DTO + generated TS + application type) — the row is the internal Kotlin shape, the item is the wire shape; the client maps `SignalementHistoryItem` fields 1:1. `decision` is the shared enum `SignalementDecision` (DISMISS/ACTION) on the backend, string `'dismiss'|'action'` on the wire. `listHandled(limit)` signature identical across port, Pg, in-memory, and both fake repos.
