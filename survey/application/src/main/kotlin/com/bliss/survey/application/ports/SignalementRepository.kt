package com.bliss.survey.application.ports

import com.bliss.survey.domain.model.PlayerReport
import com.bliss.survey.domain.model.ReportId
import com.bliss.survey.domain.model.ReportStatus
import com.bliss.survey.domain.model.UserId
import java.time.Instant
import java.util.UUID

interface SignalementRepository {
    /** Returns false when the partial unique index rejects a duplicate authenticated report; true when the row was stored. */
    suspend fun insert(report: PlayerReport): Boolean

    /** The id of this reporter's existing report for the same clue+puzzle, or null — drives idempotent dedup (returns the real persisted id). */
    suspend fun findExisting(
        reporterId: UserId,
        clueText: String,
        puzzleId: UUID?,
    ): ReportId?

    suspend fun listPending(): List<PlayerReport>

    /** Already-triaged reports (dismissed or actioned), newest triagedAt first, capped at [limit]. */
    suspend fun listHandled(limit: Int): List<PlayerReport>

    suspend fun findById(id: ReportId): PlayerReport?

    suspend fun updateStatus(
        id: ReportId,
        status: ReportStatus,
        triagedBy: UserId,
        triagedAt: Instant,
    )

    /** Reopen a triaged report: back to PENDING with triagedAt/triagedBy cleared (ADR-0116). */
    suspend fun revertToPending(id: ReportId)

    suspend fun anonymiseForUser(userId: UserId)
}
