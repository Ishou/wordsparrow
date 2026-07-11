package com.bliss.survey.application.usecases

import com.bliss.survey.application.ports.SignalementRepository
import com.bliss.survey.domain.model.ReportId
import com.bliss.survey.domain.model.ReportReason
import java.time.Instant
import java.util.UUID

data class SignalementGroup(
    val reportId: ReportId,
    val wordText: String?,
    val clueText: String,
    val reason: ReportReason,
    val count: Int,
    val latestNote: String?,
    val latestAt: Instant,
)

private data class GroupKey(
    val clueText: String,
    val puzzleId: UUID?,
    val reason: ReportReason,
)

class ListSignalementsUseCase(
    private val reports: SignalementRepository,
) {
    suspend fun execute(): List<SignalementGroup> =
        reports
            .listPending()
            .groupBy { GroupKey(it.clueText, it.puzzleId, it.reason) }
            .map { (key, group) ->
                val latest = group.maxBy { it.createdAt }
                SignalementGroup(
                    reportId = latest.id,
                    wordText = latest.wordText,
                    clueText = key.clueText,
                    reason = key.reason,
                    count = group.size,
                    latestNote = latest.note,
                    latestAt = latest.createdAt,
                )
            }.sortedByDescending { it.latestAt }
}
