package com.bliss.survey.application.usecases

import com.bliss.survey.application.ports.Clock
import com.bliss.survey.application.ports.EmailSender
import com.bliss.survey.application.ports.GridWordResolver
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
    // Deprecated (ADR-0111): the client's own letters are ignored on write; the server resolves the real word from the grid.
    val wordText: String?,
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
    private val gridWordResolver: GridWordResolver,
    private val tx: TransactionManager,
    private val maintainerAddress: String,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    suspend fun execute(cmd: SubmitSignalementCommand): SubmitSignalementResult {
        if (cmd.reporterId != null) {
            reports.findExisting(cmd.reporterId, cmd.clueText, cmd.puzzleId)?.let {
                return SubmitSignalementResult.DuplicateIgnored(it)
            }
        }

        // Server owns the word (ADR-0111): resolve it from the grid outside the tx and ignore any client-sent wordText (ADR-0076).
        val resolvedWord = resolveWord(cmd)

        val reportId = ReportId(ids.next())
        val report =
            PlayerReport(
                id = reportId,
                wordText = resolvedWord,
                clueText = cmd.clueText,
                reason = cmd.reason,
                note = cmd.note,
                puzzleId = cmd.puzzleId,
                surface = cmd.surface,
                reporterId = cmd.reporterId,
                status = ReportStatus.PENDING,
                createdAt = clock.now(),
            )
        // Race-loser on the (reporter, clue, puzzle) unique index: return the winner's real id so /decision resolves (fallback to the minted id defensively).
        val inserted = tx.inTransaction { reports.insert(report) }
        if (!inserted) {
            val existing = cmd.reporterId?.let { reports.findExisting(it, cmd.clueText, cmd.puzzleId) }
            return SubmitSignalementResult.DuplicateIgnored(existing ?: reportId)
        }

        if (cmd.reason.isHarm()) {
            // The report is durably saved; a Brevo outage must not fail the request — the alert is a side effect, not a precondition.
            runCatching {
                email.send(
                    OutboundEmail(
                        to = maintainerAddress,
                        subject = "Signalement — ${cmd.reason.name.lowercase()} : ${resolvedWord ?: cmd.clueText}",
                        textBody = harmBody(cmd, resolvedWord),
                    ),
                )
            }.onFailure { log.warn("signalement_harm_email_failed reason={} error={}", cmd.reason.name.lowercase(), it.toString()) }
        }
        return SubmitSignalementResult.Accepted(report.id)
    }

    // Surface-dispatched (ADR-0111): puzzle surfaces resolve from the grid; mini_game has no report button yet, so its branch is stubbed.
    private suspend fun resolveWord(cmd: SubmitSignalementCommand): String? =
        when (cmd.surface) {
            ReportSurface.SOLO, ReportSurface.DAILY, ReportSurface.MULTIPLAYER ->
                cmd.puzzleId?.let { puzzleId ->
                    gridWordResolver.resolve(puzzleId, cmd.clueText).also { word ->
                        if (word == null) {
                            log.warn("signalement_word_unresolved puzzleId={} surface={}", puzzleId, cmd.surface.name.lowercase())
                        }
                    }
                } ?: run {
                    log.warn("signalement_puzzle_id_missing surface={}", cmd.surface.name.lowercase())
                    null
                }
            ReportSurface.MINI_GAME -> null
        }

    private fun harmBody(
        cmd: SubmitSignalementCommand,
        resolvedWord: String?,
    ): String =
        buildString {
            appendLine("Un joueur a signalé un contenu potentiellement offensant.")
            appendLine()
            resolvedWord?.let { appendLine("Mot : $it") }
            appendLine("Définition : ${cmd.clueText}")
            appendLine("Raison : ${cmd.reason.name.lowercase()}")
            appendLine("Surface : ${cmd.surface.name.lowercase()}")
            cmd.note?.let { appendLine("Note : $it") }
        }
}
