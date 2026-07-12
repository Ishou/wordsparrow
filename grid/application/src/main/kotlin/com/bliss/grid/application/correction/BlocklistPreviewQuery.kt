package com.bliss.grid.application.correction

/** Read-only dry run counting already-generated grids a blocklist would affect, split by kind (ADR-0110 §4). */
interface BlocklistPreviewQuery {
    fun preview(word: String): BlocklistPreview
}

/** Affected-grid counts for a would-be blocklist: dailies are regenerated, solo grids deleted (ADR-0110). */
data class BlocklistPreview(
    val affectedDailies: Int,
    val affectedSolo: Int,
)
