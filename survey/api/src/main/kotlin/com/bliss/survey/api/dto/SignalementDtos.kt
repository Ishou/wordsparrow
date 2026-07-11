package com.bliss.survey.api.dto

import kotlinx.serialization.Serializable

// Wire DTOs for the signalement capture endpoint — camelCase per ADR-0003; enums are lowercase strings mapped to domain enums in the route.
@Serializable
data class SignalementRequest(
    val wordText: String,
    val clueText: String,
    val reason: String,
    val note: String? = null,
    val puzzleId: String? = null,
    val surface: String,
)

@Serializable
data class SignalementResponse(
    val reportId: String,
)
