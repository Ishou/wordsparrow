package com.bliss.identity.api.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class ProgressEntryDto(
    val puzzleId: String,
    val payload: JsonObject,
    val updatedAt: String,
)

@Serializable
data class ProgressListDto(
    val items: List<ProgressEntryDto>,
)

@Serializable
data class ProgressUpdateRequest(
    val payload: JsonObject,
    val baseUpdatedAt: String? = null,
)

@Serializable
data class ProgressWriteResultDto(
    val updatedAt: String,
)
