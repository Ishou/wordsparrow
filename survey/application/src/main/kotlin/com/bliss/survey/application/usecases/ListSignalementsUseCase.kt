package com.bliss.survey.application.usecases

import com.bliss.survey.application.ports.SignalementRepository
import com.bliss.survey.domain.model.ReportId
import com.bliss.survey.domain.model.ReportReason
import java.time.Instant

data class SignalementGroup(
    val reportId: ReportId,
    val wordText: String,
    val clueText: String,
    val reason: ReportReason,
    val count: Int,
    val latestNote: String?,
    val latestAt: Instant,
)

class ListSignalementsUseCase(
    private val reports: SignalementRepository,
) {
    suspend fun execute(): List<SignalementGroup> =
        reports
            .listPending()
            .groupBy { Triple(it.wordText, it.clueText, it.reason) }
            .map { (key, group) ->
                val latest = group.maxBy { it.createdAt }
                SignalementGroup(
                    reportId = latest.id,
                    wordText = key.first,
                    clueText = key.second,
                    reason = key.third,
                    count = group.size,
                    latestNote = latest.note,
                    latestAt = latest.createdAt,
                )
            }.sortedByDescending { it.latestAt }
}
