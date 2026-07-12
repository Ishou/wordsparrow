package com.bliss.grid.application.correction

/** Sink appending word->clue override rows to the offline corpus override file (ADR-0108 §3). */
interface ClueOverrideAppender {
    fun append(rows: List<ClueOverrideRow>)
}

/** One row of `data/curated/clue_overrides_fr.csv` — the file's existing `word,clue,note` shape. */
data class ClueOverrideRow(
    val word: String,
    val clue: String,
    val note: String,
)
