package com.bliss.grid.api.dto

import kotlinx.serialization.Serializable

/** Wire shapes for `POST /v1/puzzles/{puzzleId}/verify` (ADR-0099). */
@Serializable
data class VerifyGridRequest(
    val cells: List<VerifyCellInputDto>,
)

@Serializable
data class VerifyCellInputDto(
    val row: Int,
    val column: Int,
    val letter: String,
)

@Serializable
data class VerifyGridResponse(
    val cells: List<VerifyCellVerdictDto>,
    val secondsUntilNextVerify: Int,
)

@Serializable
data class VerifyCellVerdictDto(
    val row: Int,
    val column: Int,
    val correct: Boolean,
)
