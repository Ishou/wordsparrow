package com.bliss.survey.application.usecases

import com.bliss.survey.application.ports.SignalementRepository
import com.bliss.survey.domain.model.ReportId

sealed interface UndoSignalementResult {
    data object Reopened : UndoSignalementResult

    data object NotFound : UndoSignalementResult
}

/** Reopens a triaged report — back to the pending queue (ADR-0116). Idempotent. */
class UndoSignalementUseCase(
    private val reports: SignalementRepository,
) {
    suspend fun execute(reportId: ReportId): UndoSignalementResult {
        reports.findById(reportId) ?: return UndoSignalementResult.NotFound
        reports.revertToPending(reportId)
        return UndoSignalementResult.Reopened
    }
}
