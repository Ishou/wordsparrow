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
    suspend fun execute(): List<SignalementHistoryRow> = reports.listHandled(HANDLED_LIMIT).map { it.toHistoryRow() }

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
        // ADR-0115: advisory recent-window, not a durable audit log.
        const val HANDLED_LIMIT = 200
    }
}
