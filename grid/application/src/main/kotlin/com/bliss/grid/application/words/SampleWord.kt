package com.bliss.grid.application.words

/** A teaser clue (ADR-0073, ADR-0076). `token` is the verify handle; `answer` is deprecated. */
data class SampleWord(
    val clue: String,
    val answerLength: Int,
    val token: String,
    val answer: String,
)
