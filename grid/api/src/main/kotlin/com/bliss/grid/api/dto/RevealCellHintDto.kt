package com.bliss.grid.api.dto

import kotlinx.serialization.Serializable

/**
 * Wire shapes for `POST /v1/puzzles/{puzzleId}/hints` per `grid/api/openapi.yaml`.
 * The route deserializes [RevealCellHintRequest], invokes the use case, and
 * emits [RevealCellHintResult] on the 200 path or a `ProblemDetails` on
 * 400 / 401 / 404 / 429. [direction] is the wire `Direction` enum (`across`/`down`).
 */
@Serializable
data class RevealCellHintRequest(
    val row: Int,
    val column: Int,
    val direction: String,
)

@Serializable
data class RevealCellHintResult(
    val cells: List<RevealedCellDto>,
    val hintsRemaining: Int,
)

@Serializable
data class RevealedCellDto(
    val row: Int,
    val column: Int,
    val letter: String,
)
