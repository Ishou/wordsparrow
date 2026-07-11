package com.bliss.survey.application.usecases

import com.bliss.survey.application.ports.Clock
import com.bliss.survey.application.ports.EmailSender
import com.bliss.survey.application.ports.IdGenerator
import com.bliss.survey.application.ports.OutboundEmail
import com.bliss.survey.application.ports.SignalementRepository
import com.bliss.survey.application.ports.TransactionManager
import com.bliss.survey.domain.model.PlayerReport
import com.bliss.survey.domain.model.ReportId
import com.bliss.survey.domain.model.ReportReason
import com.bliss.survey.domain.model.ReportStatus
import com.bliss.survey.domain.model.ReportSurface
import com.bliss.survey.domain.model.UserId
import org.slf4j.LoggerFactory
import java.util.UUID

sealed interface SubmitSignalementResult {
    data class Accepted(
        val reportId: ReportId,
    ) : SubmitSignalementResult

    data class DuplicateIgnored(
        val reportId: ReportId,
    ) : SubmitSignalementResult
}

data class SubmitSignalementCommand(
    val wordText: String,
    val clueText: String,
    val reason: ReportReason,
    val note: String?,
    val puzzleId: UUID?,
    val surface: ReportSurface,
    val reporterId: UserId?,
)

class SubmitSignalementUseCase(
    private val reports: SignalementRepository,
    private val ids: IdGenerator,
    private val clock: Clock,
    private val email: EmailSender,
    private val tx: TransactionManager,
    private val maintainerAddress: String,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    suspend fun execute(cmd: SubmitSignalementCommand): SubmitSignalementResult {
        val reportId = ReportId(ids.next())
        if (cmd.reporterId != null && reports.existsFor(cmd.reporterId, cmd.wordText, cmd.clueText)) {
            return SubmitSignalementResult.DuplicateIgnored(reportId)
        }

        val report =
            PlayerReport(
                id = reportId,
                wordText = cmd.wordText,
                clueText = cmd.clueText,
                reason = cmd.reason,
                note = cmd.note,
                puzzleId = cmd.puzzleId,
                surface = cmd.surface,
                reporterId = cmd.reporterId,
                status = ReportStatus.PENDING,
                createdAt = clock.now(),
            )
        // Race-loser on the (reporter, word, clue) unique index: the report already exists, so treat it as an idempotent duplicate.
        val inserted = tx.inTransaction { reports.insert(report) }
        if (!inserted) return SubmitSignalementResult.DuplicateIgnored(reportId)

        if (cmd.reason.isHarm()) {
            // The report is durably saved; a Brevo outage must not fail the request — the alert is a side effect, not a precondition.
            runCatching {
                email.send(
                    OutboundEmail(
                        to = maintainerAddress,
                        subject = "Signalement — ${cmd.reason.name.lowercase()} : ${cmd.wordText}",
                        textBody = harmBody(cmd),
                    ),
                )
            }.onFailure { log.warn("signalement_harm_email_failed reason={} error={}", cmd.reason.name.lowercase(), it.toString()) }
        }
        return SubmitSignalementResult.Accepted(report.id)
    }

    private fun harmBody(cmd: SubmitSignalementCommand): String =
        buildString {
            appendLine("Un joueur a signalé un contenu potentiellement offensant.")
            appendLine()
            appendLine("Mot : ${cmd.wordText}")
            appendLine("Définition : ${cmd.clueText}")
            appendLine("Raison : ${cmd.reason.name.lowercase()}")
            appendLine("Surface : ${cmd.surface.name.lowercase()}")
            cmd.note?.let { appendLine("Note : $it") }
        }
}
