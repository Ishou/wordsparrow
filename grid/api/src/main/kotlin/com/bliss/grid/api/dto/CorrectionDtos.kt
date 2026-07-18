package com.bliss.grid.api.dto

import kotlinx.serialization.Serializable

/** `200` body for `GET /v1/words/{word}/clues`: every clue the corpus carries, for the correction picker (ADR-0108). */
@Serializable
data class WordCluesResultDto(
    val clues: List<WordClueItemDto>,
)

/** One candidate clue in the picker; `theme` is required-and-nullable on the wire (ADR-0003 §6). */
@Serializable
data class WordClueItemDto(
    val text: String,
    val theme: String?,
)

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

/** Wire request for `POST /v1/corrections/blocklist-word`; `wordText` is required, `reason` optional (ADR-0110). */
@Serializable
data class BlocklistWordRequestDto(
    val wordText: String,
    val reason: String? = null,
)

/** `200` body for `GET /v1/corrections/blocklist-preview`: affected-grid counts split by kind (ADR-0110 §4). */
@Serializable
data class BlocklistPreviewDto(
    val affectedDailies: Int,
    val affectedSolo: Int,
)

/** `200` body for `GET /v1/corrections/preview` — impact of a clue correction (ADR-0108). */
@Serializable
data class CorrectionPreviewDto(
    val affectedDailies: Int,
    val affectedSolo: Int,
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
