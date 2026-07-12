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
}

/** Outcome of [CorrectionRepository.recordForbidGuarded]. */
sealed interface GuardedRecord {
    data class Recorded(
        val id: UUID,
    ) : GuardedRecord

    data object LastClueForbidden : GuardedRecord
}
