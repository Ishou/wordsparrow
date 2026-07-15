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
            reports.reports +=
                handled("22222222-2222-7222-8222-222222222222", ReportStatus.DISMISSED, Instant.parse("2026-07-11T11:00:00Z"))

            val rows = ListHandledSignalementsUseCase(reports).execute()

            assertThat(rows.map { it.decision }).containsExactly(SignalementDecision.DISMISS, SignalementDecision.ACTION)
            assertThat(rows.first().triagedAt).isEqualTo(Instant.parse("2026-07-11T11:00:00Z"))
        }
}
