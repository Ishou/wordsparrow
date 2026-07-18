package com.bliss.survey.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import com.bliss.survey.api.auth.SESSION_COOKIE_NAME
import com.bliss.survey.application.ports.SignalementRepository
import com.bliss.survey.application.usecases.DecideSignalementUseCase
import com.bliss.survey.application.usecases.ListSignalementsUseCase
import com.bliss.survey.application.usecases.UndoSignalementUseCase
import com.bliss.survey.domain.model.PlayerReport
import com.bliss.survey.domain.model.ReportId
import com.bliss.survey.domain.model.ReportReason
import com.bliss.survey.domain.model.ReportStatus
import com.bliss.survey.domain.model.ReportSurface
import com.bliss.survey.domain.model.UserId
import io.ktor.client.request.cookie
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class SignalementQueueRouteTest {
    private val reportUuid = UUID.fromString("11111111-1111-7111-8111-111111111111")

    private class FakeRepo(
        seed: List<PlayerReport> = emptyList(),
    ) : SignalementRepository {
        val reports = seed.toMutableList()

        override suspend fun insert(report: PlayerReport): Boolean {
            reports += report
            return true
        }

        override suspend fun findExisting(
            reporterId: UserId,
            clueText: String,
            puzzleId: UUID?,
        ): ReportId? = null

        override suspend fun listPending(): List<PlayerReport> = reports.filter { it.status == ReportStatus.PENDING }

        override suspend fun listHandled(limit: Int): List<PlayerReport> =
            reports.filter { it.status != ReportStatus.PENDING }.sortedByDescending { it.triagedAt ?: Instant.MIN }.take(limit)

        override suspend fun findById(id: ReportId): PlayerReport? = reports.firstOrNull { it.id == id }

        override suspend fun updateStatus(
            id: ReportId,
            status: ReportStatus,
            triagedBy: UserId,
            triagedAt: Instant,
        ) {
            reports.withIndex().firstOrNull { it.value.id == id }?.let { (idx, r) ->
                reports[idx] = r.copy(status = status, triagedBy = triagedBy, triagedAt = triagedAt)
            }
        }

        override suspend fun revertToPending(id: ReportId) {
            reports.withIndex().firstOrNull { it.value.id == id }?.let { (idx, r) ->
                reports[idx] = r.copy(status = ReportStatus.PENDING, triagedBy = null, triagedAt = null)
            }
        }

        override suspend fun anonymiseForUser(userId: UserId) {}
    }

    private fun report(
        id: UUID = reportUuid,
        status: ReportStatus = ReportStatus.PENDING,
        reporterId: UUID? = null,
    ) = PlayerReport(
        id = ReportId(id),
        wordText = "CHAT",
        clueText = "Animal qui miaule",
        reason = ReportReason.ERREUR_SENS,
        note = "contre-sens",
        puzzleId = null,
        surface = ReportSurface.SOLO,
        reporterId = reporterId?.let(::UserId),
        status = status,
        createdAt = Instant.parse("2026-07-11T10:00:00Z"),
    )

    private fun io.ktor.server.application.Application.wire(repo: FakeRepo) {
        installCapabilitySession()
        install(ContentNegotiation) { json() }
        val list = ListSignalementsUseCase(repo)
        val decide = DecideSignalementUseCase(repo)
        val undo = UndoSignalementUseCase(repo)
        routing {
            signalementQueueRoute(
                list = { viewerId -> list.execute(viewerId) },
                decide = { id, decision, uid -> decide.decide(id, decision, uid, Instant.parse("2026-07-11T12:00:00Z")) },
            )
            signalementUndoRoute(undo = { id -> undo.execute(id) })
        }
    }

    @Test
    fun `GET without a cookie is 403`() =
        testApplication {
            application { wire(FakeRepo(listOf(report()))) }
            assertThat(client.get("/v1/signalements").status).isEqualTo(HttpStatusCode.Forbidden)
        }

    @Test
    fun `GET as a player is 403`() =
        testApplication {
            application { wire(FakeRepo(listOf(report()))) }
            val resp = client.get("/v1/signalements") { cookie(SESSION_COOKIE_NAME, PLAYER_COOKIE) }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Forbidden)
        }

    @Test
    fun `GET as a maintainer is 200 with the grouped summary`() =
        testApplication {
            application { wire(FakeRepo(listOf(report()))) }
            val resp = client.get("/v1/signalements") { cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE) }
            assertThat(resp.status).isEqualTo(HttpStatusCode.OK)
            val body = resp.bodyAsText()
            assertThat(body).contains("\"reportId\":\"11111111-1111-7111-8111-111111111111\"")
            assertThat(body).contains("\"reason\":\"erreur_sens\"")
            assertThat(body).contains("\"surface\":\"solo\"")
            assertThat(body).contains("\"count\":1")
            assertThat(body).contains("\"latestNote\":\"contre-sens\"")
        }

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

    @Test
    fun `POST decision without a cookie is 403`() =
        testApplication {
            application { wire(FakeRepo(listOf(report()))) }
            val resp =
                client.post("/v1/signalements/$reportUuid/decision") {
                    contentType(ContentType.Application.Json)
                    setBody("""{"decision":"dismiss"}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Forbidden)
        }

    @Test
    fun `POST dismiss as a maintainer is 204 and marks the report dismissed`() =
        testApplication {
            val repo = FakeRepo(listOf(report()))
            application { wire(repo) }
            val resp =
                client.post("/v1/signalements/$reportUuid/decision") {
                    cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE)
                    contentType(ContentType.Application.Json)
                    setBody("""{"decision":"dismiss"}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.NoContent)
            assertThat(repo.reports.single().status).isEqualTo(ReportStatus.DISMISSED)
        }

    @Test
    fun `POST action as a maintainer marks the report actioned`() =
        testApplication {
            val repo = FakeRepo(listOf(report()))
            application { wire(repo) }
            val resp =
                client.post("/v1/signalements/$reportUuid/decision") {
                    cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE)
                    contentType(ContentType.Application.Json)
                    setBody("""{"decision":"action"}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.NoContent)
            assertThat(repo.reports.single().status).isEqualTo(ReportStatus.ACTIONED)
        }

    @Test
    fun `POST decision on an unknown reportId is 404`() =
        testApplication {
            application { wire(FakeRepo(listOf(report()))) }
            val unknown = UUID.fromString("22222222-2222-7222-8222-222222222222")
            val resp =
                client.post("/v1/signalements/$unknown/decision") {
                    cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE)
                    contentType(ContentType.Application.Json)
                    setBody("""{"decision":"dismiss"}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.NotFound)
        }

    @Test
    fun `POST decision with an invalid decision value is 400`() =
        testApplication {
            application { wire(FakeRepo(listOf(report()))) }
            val resp =
                client.post("/v1/signalements/$reportUuid/decision") {
                    cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE)
                    contentType(ContentType.Application.Json)
                    setBody("""{"decision":"maybe"}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.BadRequest)
        }

    @Test
    fun `POST decision with a non-uuid reportId is 400`() =
        testApplication {
            application { wire(FakeRepo(listOf(report()))) }
            val resp =
                client.post("/v1/signalements/not-a-uuid/decision") {
                    cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE)
                    contentType(ContentType.Application.Json)
                    setBody("""{"decision":"dismiss"}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.BadRequest)
        }

    @Test
    fun `POST undo without a cookie is 403`() =
        testApplication {
            application { wire(FakeRepo(listOf(report(status = ReportStatus.ACTIONED)))) }
            assertThat(client.post("/v1/signalements/$reportUuid/undo").status).isEqualTo(HttpStatusCode.Forbidden)
        }

    @Test
    fun `POST undo as a maintainer reopens the report to pending`() =
        testApplication {
            val repo = FakeRepo(listOf(report(status = ReportStatus.ACTIONED)))
            application { wire(repo) }
            val resp = client.post("/v1/signalements/$reportUuid/undo") { cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE) }
            assertThat(resp.status).isEqualTo(HttpStatusCode.NoContent)
            assertThat(repo.reports.single().status).isEqualTo(ReportStatus.PENDING)
        }

    @Test
    fun `POST undo on an unknown reportId is 404`() =
        testApplication {
            application { wire(FakeRepo()) }
            val resp = client.post("/v1/signalements/$reportUuid/undo") { cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE) }
            assertThat(resp.status).isEqualTo(HttpStatusCode.NotFound)
        }
}
