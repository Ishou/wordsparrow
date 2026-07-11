package com.bliss.survey.application.ports

import com.bliss.survey.domain.model.PlayerReport
import com.bliss.survey.domain.model.ReportId
import com.bliss.survey.domain.model.ReportStatus
import com.bliss.survey.domain.model.UserId
import java.time.Instant

interface SignalementRepository {
    /** Returns false when the partial unique index rejects a duplicate authenticated report; true when the row was stored. */
    suspend fun insert(report: PlayerReport): Boolean

    /** The id of this reporter's existing report for the same word+clue, or null — drives idempotent dedup (returns the real persisted id). */
    suspend fun findExisting(
        reporterId: UserId,
        wordText: String,
        clueText: String,
    ): ReportId?

    suspend fun listPending(): List<PlayerReport>

    suspend fun findById(id: ReportId): PlayerReport?

    suspend fun updateStatus(
        id: ReportId,
        status: ReportStatus,
        triagedBy: UserId,
        triagedAt: Instant,
    )

    suspend fun anonymiseForUser(userId: UserId)
}
