package com.bliss.grid.application.words

/** A clue-answer pair for the home teaser (ADR-0073). `answer` is the folded A-Z surface form. */
data class SampleWord(
    val clue: String,
    val answer: String,
)
