package com.bliss.grid.api.dto

import kotlinx.serialization.Serializable

/**
 * Wire shapes for `POST /v1/puzzles/{puzzleId}/validate` per
 * `grid/api/openapi.yaml`. The route deserializes [ValidatePuzzleRequest],
 * invokes the use case, and emits [ValidatePuzzleResult] on the 200 path
 * (a binary verdict — no positional data, ADR-0076) or a `ProblemDetails` on
 * 400 / 404.
 */
@Serializable
data class ValidatePuzzleRequest(
    val filledCells: List<FilledCellDto>,
)

@Serializable
data class FilledCellDto(
    val row: Int,
    val column: Int,
    val letter: String,
)

@Serializable
data class ValidatePuzzleResult(
    val solved: Boolean,
)
