package com.bliss.grid.api.dto

import kotlinx.serialization.Serializable

/** Wire shape for `SampleWord` (ADR-0073, ADR-0076). `answer` is deprecated; `token` validates. */
@Serializable
data class SampleWordDto(
    val clue: String,
    val answerLength: Int,
    val token: String,
    val answer: String,
)
