package com.bliss.grid.api.dto

import kotlinx.serialization.Serializable

/** Wire shapes for `POST /v1/puzzles/{puzzleId}/validate-word` (ADR-0084); internal per-word binary verdict. */
@Serializable
data class ValidateWordRequest(
    val cells: List<FilledCellDto>,
)

@Serializable
data class ValidateWordResult(
    val correct: Boolean,
)
