package com.bliss.grid.application.words

/** A teaser clue (ADR-0073, ADR-0076). `token` is the only verify handle; no plaintext answer. */
data class SampleWord(
    val clue: String,
    val answerLength: Int,
    val token: String,
)
