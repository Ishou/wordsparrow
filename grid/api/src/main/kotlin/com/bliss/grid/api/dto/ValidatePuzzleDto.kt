package com.bliss.grid.api.dto

import kotlinx.serialization.Serializable

/** Wire shapes for `POST /v1/puzzles/{puzzleId}/validate`; ADR-0076 binary verdict. */
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
