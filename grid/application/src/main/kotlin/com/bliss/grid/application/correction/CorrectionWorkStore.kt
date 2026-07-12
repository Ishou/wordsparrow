package com.bliss.grid.application.correction

import com.bliss.grid.domain.correction.ClueCorrection
import java.util.UUID

/** Worker-side reads/writes over the corrections store: backfill progress and offline export (ADR-0108 §4). */
interface CorrectionWorkStore {
    /** Corrections whose backfill is pending or running, oldest first. */
    fun backfillJobs(): List<CorrectionBackfillJob>

    /** Claims a pending correction: sets status running and records the total [gridsMatched] once. */
    fun beginBackfill(
        correctionId: UUID,
        gridsMatched: Int,
    )

    /** Adds [patchedDelta] to grids_patched and stamps the heartbeat. */
    fun heartbeatBackfill(
        correctionId: UUID,
        patchedDelta: Int,
    )

    /** Marks the backfill done. */
    fun completeBackfill(correctionId: UUID)

    /** Marks the backfill failed and records [error]. */
    fun failBackfill(
        correctionId: UUID,
        error: String,
    )

    /** Un-exported corrections expressible as a word->clue override (replace with a word and a new clue). */
    fun exportableCorrections(): List<ExportableCorrection>

    /** Stamps exported_at for [correctionId]. */
    fun markExported(correctionId: UUID)
}

/** A correction with an in-flight or not-yet-started existing-grid backfill. */
data class CorrectionBackfillJob(
    val correctionId: UUID,
    val correction: ClueCorrection,
    val status: BackfillStatus,
    val gridsMatched: Int?,
    val gridsPatched: Int,
)

/** A replace correction that maps onto a `word,clue,note` override row. */
data class ExportableCorrection(
    val correctionId: UUID,
    val wordText: String,
    val newClueText: String,
    val reason: String?,
)
