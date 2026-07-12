package com.bliss.grid.api.dto

import kotlinx.serialization.Serializable

/** Wire request for `POST /v1/corrections`; `kind` discriminates and the route validates per-kind fields (ADR-0108). */
@Serializable
data class CorrectionRequestDto(
    val kind: String,
    val oldClueText: String,
    val wordText: String? = null,
    val newClueText: String? = null,
)

/** `202` body for a recorded correction (ADR-0108). */
@Serializable
data class CorrectionAcceptedDto(
    val correctionId: String,
    val backfillStatus: String,
)

/** `200` body for `GET /v1/corrections/{correctionId}` (ADR-0108 §4). */
@Serializable
data class CorrectionProgressDto(
    val correctionId: String,
    val kind: String,
    val backfillStatus: String,
    // Required-and-nullable on the wire: null while pending, never absent (ADR-0003 §6).
    val gridsMatched: Int?,
    val gridsPatched: Int,
)
