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
    private class FakeRepo(
        seed: List<PlayerReport> = emptyList(),
    ) : SignalementRepository {
        val reports = seed.toMutableList()

        override suspend fun insert(report: PlayerReport): Boolean = reports.add(report)

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
        ) {}

        override suspend fun revertToPending(id: ReportId) {}

        override suspend fun anonymiseForUser(userId: UserId) {}
    }

    private fun handled(id: UUID) =
        PlayerReport(
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
