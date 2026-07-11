package com.bliss.survey.domain.model

import java.time.Instant
import java.util.UUID

data class PlayerReport(
    val id: ReportId,
    val wordText: String,
    val clueText: String,
    val reason: ReportReason,
    val note: String?,
    val puzzleId: UUID?,
    val surface: ReportSurface,
    val reporterId: UserId?,
    val status: ReportStatus,
    val createdAt: Instant,
    val triagedAt: Instant? = null,
    val triagedBy: UserId? = null,
) {
    init {
        require(wordText.isNotBlank()) { "wordText must not be blank" }
        require(wordText.length <= MAX_WORD_LENGTH) { "wordText bounded to $MAX_WORD_LENGTH chars (was ${wordText.length})" }
        require(clueText.isNotBlank()) { "clueText must not be blank" }
        require(clueText.length <= MAX_CLUE_LENGTH) { "clueText bounded to $MAX_CLUE_LENGTH chars (was ${clueText.length})" }
        note?.let {
            require(it.length <= MAX_NOTE_LENGTH) { "note bounded to $MAX_NOTE_LENGTH chars (was ${it.length})" }
        }
    }

    companion object {
        const val MAX_WORD_LENGTH = 64
        const val MAX_CLUE_LENGTH = 512
        const val MAX_NOTE_LENGTH = 500
    }
}
