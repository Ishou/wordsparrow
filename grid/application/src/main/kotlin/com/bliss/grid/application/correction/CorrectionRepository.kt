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

    /**
     * Atomic last-clue guard for a `forbid_clue` (ADR-0108 §2). Serializes on the target word and
     * re-reads the committed active corrections inside the same write, so two concurrent forbids on
     * the same word cannot each pass the check against a stale snapshot and jointly empty it. Mirrors
     * `LobbyRepository.mutate`'s read-decide-write under a per-key lock: [wouldEmptyWord] is the
     * decision callback, invoked with the corrections active at check time; returning true leaves the
     * row unwritten and yields [GuardedRecord.LastClueForbidden], otherwise [correction] is inserted.
     */
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
