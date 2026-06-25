package com.bliss.grid.api.dto

import kotlinx.serialization.Serializable

/** Wire shape for `SampleWord` (ADR-0073): a clue-answer pair for the home teaser. */
@Serializable
data class SampleWordDto(
    val clue: String,
    val answer: String,
)
