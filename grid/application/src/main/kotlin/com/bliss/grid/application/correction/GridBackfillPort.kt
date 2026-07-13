package com.bliss.grid.application.correction

import com.bliss.grid.domain.correction.ClueCorrection
import java.time.LocalDate

/** Patches stored-grid payloads for a correction; the work queue is "rows still matching old_clue_text" (ADR-0108 §4). */
interface GridBackfillPort {
    /** Count of stored grids whose chosen clue still matches [correction]. */
    fun countMatching(correction: ClueCorrection): Int

    /** Patches up to [limit] still-matching grids, each isolated; a patched grid drops out of the work queue. */
    fun patchBatch(
        correction: ClueCorrection,
        limit: Int,
    ): PatchBatchResult
}

/** Outcome of one [GridBackfillPort.patchBatch] pass. */
data class PatchBatchResult(
    val patched: Int,
    val failed: Int,
    val lastError: String?,
    /** Puzzle dates of patched daily rows, so the worker can purge their edge cache (ADR-0089 §5). */
    val patchedDates: List<LocalDate> = emptyList(),
)
