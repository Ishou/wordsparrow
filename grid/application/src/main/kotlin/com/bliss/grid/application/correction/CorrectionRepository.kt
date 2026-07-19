package com.bliss.grid.application.correction

import com.bliss.grid.domain.correction.ClueCorrection
import java.util.UUID

/** Durable store for maintainer clue corrections (ADR-0108). */
interface CorrectionRepository {
    /** Persists [correction] stamped with [createdBy] and returns its new UUID v7 id. */
    fun record(
        correction: ClueCorrection,
        createdBy: UUID,
    ): UUID

    /** Atomic last-clue guard for forbid_clue; re-reads active corrections inside the write to close the concurrent-forbid TOCTOU (ADR-0108 §2). */
    fun recordForbidGuarded(
        correction: ClueCorrection,
        createdBy: UUID,
        wouldEmptyWord: (active: List<ClueCorrection>) -> Boolean,
    ): GuardedRecord

    /** Corrections the generation overlay must apply — recorded but not yet exported to the offline corpus. */
    fun active(): List<ClueCorrection>

    /** Backfill progress for [correctionId], or null when no such correction exists. */
    fun progress(correctionId: UUID): CorrectionProgress?

    /** Active (not exported, not reverted) corrections to reverse: replace/forbid by [oldClueText], blocklist by folded [wordText] (ADR-0116). */
    fun findReversible(
        oldClueText: String,
        wordText: String?,
    ): List<ReversibleCorrection>

    /** Deactivate a correction: sets reverted_at so the overlay and export skip it (ADR-0116). */
    fun deactivate(correctionId: UUID)

    /** Atomically finds and reverses the match for [oldClueText]/[wordText]; [compensate] returns an optional correction to record before deactivating, closing the same TOCTOU [recordForbidGuarded] closes (ADR-0116). */
    fun reverseGuarded(
        oldClueText: String,
        wordText: String?,
        reversedBy: UUID,
        compensate: (ReversibleCorrection) -> ClueCorrection?,
    ): ClueCorrection.Kind?
}

/** A stored correction (with its id) that can be reversed (ADR-0116). */
data class ReversibleCorrection(
    val id: UUID,
    val kind: ClueCorrection.Kind,
    val oldClueText: String?,
    val newClueText: String?,
    val wordText: String?,
)

/** Outcome of [CorrectionRepository.recordForbidGuarded]. */
sealed interface GuardedRecord {
    data class Recorded(
        val id: UUID,
    ) : GuardedRecord

    data object LastClueForbidden : GuardedRecord
}
