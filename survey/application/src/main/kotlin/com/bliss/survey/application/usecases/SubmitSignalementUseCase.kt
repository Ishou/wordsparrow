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
import java.util.UUID

sealed interface SubmitSignalementResult {
    data class Accepted(
        val reportId: ReportId,
    ) : SubmitSignalementResult

    data object DuplicateIgnored : SubmitSignalementResult
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
    suspend fun execute(cmd: SubmitSignalementCommand): SubmitSignalementResult {
        if (cmd.reporterId != null && reports.existsFor(cmd.reporterId, cmd.wordText, cmd.clueText)) {
            return SubmitSignalementResult.DuplicateIgnored
        }

        val report =
            PlayerReport(
                id = ReportId(ids.next()),
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
        tx.inTransaction { reports.insert(report) }

        if (cmd.reason.isHarm()) {
            email.send(
                OutboundEmail(
                    to = maintainerAddress,
                    subject = "Signalement — ${cmd.reason.name.lowercase()} : ${cmd.wordText}",
                    textBody = harmBody(cmd),
                ),
            )
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
