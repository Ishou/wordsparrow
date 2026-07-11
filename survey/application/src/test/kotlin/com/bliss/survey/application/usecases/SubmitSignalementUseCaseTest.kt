package com.bliss.survey.application.usecases

import assertk.assertThat
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isTrue
import com.bliss.survey.application.ports.EmailSender
import com.bliss.survey.application.ports.IdGenerator
import com.bliss.survey.application.ports.OutboundEmail
import com.bliss.survey.domain.model.PlayerReport
import com.bliss.survey.domain.model.ReportReason
import com.bliss.survey.domain.model.ReportStatus
import com.bliss.survey.domain.model.ReportSurface
import com.bliss.survey.domain.model.UserId
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class SubmitSignalementUseCaseTest {
    private val now = Instant.parse("2026-07-11T10:00:00Z")
    private val fixedId = UUID.fromString("11111111-1111-7111-8111-111111111111")
    private val reporter = UserId(UUID.fromString("33333333-3333-7333-8333-333333333333"))
    private val maintainer = "maintainer@wordsparrow.io"

    private class FakeEmailSender : EmailSender {
        val sent = mutableListOf<OutboundEmail>()

        override suspend fun send(email: OutboundEmail) {
            sent += email
        }
    }

    private fun useCase(
        reports: InMemorySignalementRepository,
        email: EmailSender,
    ): SubmitSignalementUseCase =
        SubmitSignalementUseCase(
            reports = reports,
            ids = IdGenerator { fixedId },
            clock = { now },
            email = email,
            tx = passThroughTransactionManager,
            maintainerAddress = maintainer,
        )

    private fun command(
        reason: ReportReason = ReportReason.ERREUR_SENS,
        reporterId: UserId? = reporter,
    ): SubmitSignalementCommand =
        SubmitSignalementCommand(
            wordText = "CHAT",
            clueText = "Animal qui miaule",
            reason = reason,
            note = null,
            puzzleId = null,
            surface = ReportSurface.SOLO,
            reporterId = reporterId,
        )

    @Test
    fun `persists a PENDING report and returns its id`() =
        runTest {
            val reports = InMemorySignalementRepository()

            val result = useCase(reports, FakeEmailSender()).execute(command())

            assertThat(result).isInstanceOf(SubmitSignalementResult.Accepted::class)
            val stored = reports.reports.single()
            assertThat(stored.id.value).isEqualTo(fixedId)
            assertThat(stored.status).isEqualTo(ReportStatus.PENDING)
            assertThat(stored.createdAt).isEqualTo(now)
        }

    @Test
    fun `authenticated duplicate returns DuplicateIgnored and does not double-insert`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports +=
                PlayerReport(
                    id =
                        com.bliss.survey.domain.model
                            .ReportId(UUID.randomUUID()),
                    wordText = "CHAT",
                    clueText = "Animal qui miaule",
                    reason = ReportReason.ERREUR_SENS,
                    note = null,
                    puzzleId = null,
                    surface = ReportSurface.SOLO,
                    reporterId = reporter,
                    status = ReportStatus.PENDING,
                    createdAt = now,
                )

            val result = useCase(reports, FakeEmailSender()).execute(command())

            assertThat(result).isEqualTo(SubmitSignalementResult.DuplicateIgnored)
            assertThat(reports.reports).hasSize(1)
        }

    @Test
    fun `anonymous report is never deduplicated`() =
        runTest {
            val reports = InMemorySignalementRepository()

            useCase(reports, FakeEmailSender()).execute(command(reporterId = null))
            useCase(reports, FakeEmailSender()).execute(command(reporterId = null))

            assertThat(reports.reports).hasSize(2)
        }

    @Test
    fun `harm reason sends one email to the maintainer address`() =
        runTest {
            val reports = InMemorySignalementRepository()
            val email = FakeEmailSender()

            useCase(reports, email).execute(command(reason = ReportReason.MOT_OFFENSANT))

            assertThat(email.sent).hasSize(1)
            assertThat(email.sent.single().to).isEqualTo(maintainer)
            assertThat(
                email.sent
                    .single()
                    .subject
                    .contains("mot_offensant"),
            ).isTrue()
        }

    @Test
    fun `quality reason sends no email`() =
        runTest {
            val reports = InMemorySignalementRepository()
            val email = FakeEmailSender()

            useCase(reports, email).execute(command(reason = ReportReason.TROP_FACILE))

            assertThat(email.sent).hasSize(0)
        }
}
