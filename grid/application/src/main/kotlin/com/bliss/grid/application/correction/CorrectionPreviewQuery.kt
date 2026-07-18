package com.bliss.grid.application.correction

/** Read-only dry run counting already-generated grids a clue correction would touch, split by kind (ADR-0108). */
interface CorrectionPreviewQuery {
    fun preview(
        oldClueText: String,
        wordText: String?,
    ): CorrectionPreview
}

/** Affected-grid counts for a clue correction: grids whose chosen clue matches, split daily vs solo. */
data class CorrectionPreview(
    val affectedDailies: Int,
    val affectedSolo: Int,
)
