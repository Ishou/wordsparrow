package com.bliss.grid.application.correction

/** Read-only enumeration of the clues currently frozen onto stored grids, to build a bulk-seed source (ADR-0108 amendment 2026-07-24). */
interface GridClueEnumerationQuery {
    /** Distinct (wordText, chosen clue text) pairs across all stored grid payloads, restricted to [words] (folded) when non-empty. */
    fun enumerate(words: Set<String>): List<GridClueUsage>
}

/** A clue currently displayed for [wordText] on at least one stored grid. */
data class GridClueUsage(
    val wordText: String,
    val clueText: String,
)
