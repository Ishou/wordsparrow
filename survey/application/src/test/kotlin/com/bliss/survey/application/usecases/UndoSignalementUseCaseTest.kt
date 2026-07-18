package com.bliss.survey.application.usecases

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNull
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

class UndoSignalementUseCaseTest {
    private val triager = UserId(UUID.fromString("55555555-5555-7555-8555-555555555555"))

    private fun handled(id: String) =
        PlayerReport(
            id = ReportId(UUID.fromString(id)),
            wordText = "CHAT",
            clueText = "Animal qui miaule",
            reason = ReportReason.ERREUR_SENS,
            note = null,
            puzzleId = null,
            surface = ReportSurface.SOLO,
            reporterId = null,
            status = ReportStatus.ACTIONED,
            createdAt = Instant.parse("2026-07-11T08:00:00Z"),
            triagedAt = Instant.parse("2026-07-11T09:00:00Z"),
            triagedBy = triager,
        )

    @Test
    fun `reopens a handled report back to pending, clearing triage`() =
        runTest {
            val reports = InMemorySignalementRepository()
            val id = ReportId(UUID.fromString("11111111-1111-7111-8111-111111111111"))
            reports.reports += handled("11111111-1111-7111-8111-111111111111")

            val result = UndoSignalementUseCase(reports).execute(id)

            assertThat(result).isInstanceOf(UndoSignalementResult.Reopened::class)
            val back = reports.findById(id)!!
            assertThat(back.status).isEqualTo(ReportStatus.PENDING)
            assertThat(back.triagedAt).isNull()
            assertThat(back.triagedBy).isNull()
        }

    @Test
    fun `an unknown report is NotFound and touches nothing`() =
        runTest {
            val result = UndoSignalementUseCase(InMemorySignalementRepository()).execute(ReportId(UUID.randomUUID()))

            assertThat(result).isInstanceOf(UndoSignalementResult.NotFound::class)
        }
}
