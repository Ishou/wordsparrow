package com.bliss.grid.api.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** Wire shapes for `POST /v1/puzzles/{puzzleId}/hints`; `direction` is the wire enum (`across`/`down`). */
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
    val secondsUntilNextHint: JsonElement,
)

@Serializable
data class RevealedCellDto(
    val row: Int,
    val column: Int,
    val letter: String,
)
