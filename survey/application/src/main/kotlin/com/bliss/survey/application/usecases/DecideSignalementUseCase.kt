package com.bliss.survey.application.usecases

import com.bliss.survey.application.ports.SignalementRepository
import com.bliss.survey.domain.model.ReportId
import com.bliss.survey.domain.model.ReportStatus
import com.bliss.survey.domain.model.UserId
import java.time.Instant

enum class SignalementDecision {
    DISMISS,
    ACTION,
}

sealed interface DecideSignalementResult {
    data object Decided : DecideSignalementResult

    data object NotFound : DecideSignalementResult
}

class DecideSignalementUseCase(
    private val reports: SignalementRepository,
) {
    suspend fun decide(
        reportId: ReportId,
        decision: SignalementDecision,
        maintainerId: UserId,
        now: Instant,
    ): DecideSignalementResult {
        reports.findById(reportId) ?: return DecideSignalementResult.NotFound
        val status =
            when (decision) {
                SignalementDecision.DISMISS -> ReportStatus.DISMISSED
                SignalementDecision.ACTION -> ReportStatus.ACTIONED
            }
        reports.updateStatus(reportId, status, maintainerId, now)
        return DecideSignalementResult.Decided
    }
}
