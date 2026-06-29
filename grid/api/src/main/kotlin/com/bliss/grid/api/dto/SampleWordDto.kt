package com.bliss.grid.api.dto

import kotlinx.serialization.Serializable

/** Wire shape for `SampleWord` (ADR-0073, ADR-0076). `token` validates; no plaintext answer. */
@Serializable
data class SampleWordDto(
    val clue: String,
    val answerLength: Int,
    val token: String,
)
