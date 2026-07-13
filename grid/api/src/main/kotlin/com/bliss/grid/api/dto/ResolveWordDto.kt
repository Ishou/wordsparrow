package com.bliss.grid.api.dto

import kotlinx.serialization.Serializable

/** Wire shapes for `POST /v1/puzzles/{puzzleId}/resolve-word` (ADR-0111); internal, plaintext answer word returned only to survey-api. */
@Serializable
data class ResolveWordRequest(
    val clueText: String,
)

@Serializable
data class ResolveWordResult(
    val word: String,
)
