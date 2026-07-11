package com.bliss.survey.application.usecases

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
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

class DecideSignalementUseCaseTest {
    private val now = Instant.parse("2026-07-11T12:00:00Z")
    private val maintainer = UserId(UUID.fromString("99999999-9999-7999-8999-999999999999"))
    private val reportId = ReportId(UUID.fromString("11111111-1111-7111-8111-111111111111"))

    private fun seeded(): InMemorySignalementRepository {
        val reports = InMemorySignalementRepository()
        reports.reports +=
            PlayerReport(
                id = reportId,
                wordText = "CHAT",
                clueText = "Animal qui miaule",
                reason = ReportReason.ERREUR_SENS,
                note = null,
                puzzleId = null,
                surface = ReportSurface.SOLO,
                reporterId = null,
                status = ReportStatus.PENDING,
                createdAt = Instant.parse("2026-07-11T09:00:00Z"),
            )
        return reports
    }

    @Test
    fun `dismiss sets status DISMISSED with the maintainer and time`() =
        runTest {
            val reports = seeded()

            val result = DecideSignalementUseCase(reports).decide(reportId, SignalementDecision.DISMISS, maintainer, now)

            assertThat(result).isEqualTo(DecideSignalementResult.Decided)
            val stored = reports.reports.single()
            assertThat(stored.status).isEqualTo(ReportStatus.DISMISSED)
            assertThat(stored.triagedBy).isEqualTo(maintainer)
            assertThat(stored.triagedAt).isEqualTo(now)
        }

    @Test
    fun `action sets status ACTIONED`() =
        runTest {
            val reports = seeded()

            DecideSignalementUseCase(reports).decide(reportId, SignalementDecision.ACTION, maintainer, now)

            assertThat(reports.reports.single().status).isEqualTo(ReportStatus.ACTIONED)
        }

    @Test
    fun `unknown reportId returns NotFound and touches nothing`() =
        runTest {
            val reports = seeded()
            val unknown = ReportId(UUID.fromString("22222222-2222-7222-8222-222222222222"))

            val result = DecideSignalementUseCase(reports).decide(unknown, SignalementDecision.ACTION, maintainer, now)

            assertThat(result).isInstanceOf(DecideSignalementResult.NotFound::class)
            assertThat(reports.reports.single().status).isEqualTo(ReportStatus.PENDING)
        }
}
