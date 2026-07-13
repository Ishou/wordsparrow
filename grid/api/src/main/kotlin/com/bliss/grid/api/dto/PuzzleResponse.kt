package com.bliss.grid.api.dto

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

// Required + nullable openapi fields (secondsUntilNextHint/Verify) go over a Json with explicitNulls=false (drops Kotlin nulls); a JsonElement holding JsonNull is a present value so the required key always ships.
internal fun Int?.toNullableIntWire(): JsonElement = this?.let { JsonPrimitive(it) } ?: JsonNull

@Serializable
enum class DifficultyDto(
    val wireValue: String,
) {
    @SerialName("facile")
    FACILE("facile"),

    @SerialName("moyen")
    MOYEN("moyen"),

    @SerialName("difficile")
    DIFFICILE("difficile"),

    ;

    companion object {
        // String → enum lookup for callers that exchange the wire token
        // across the application boundary (where importing `DifficultyDto`
        // would be a layer violation). `null` for unknown values, leaving
        // the route layer to decide the fallback.
        fun fromWire(value: String): DifficultyDto? = entries.firstOrNull { it.wireValue == value }
    }
}

/**
 * `Puzzle` schema from `grid/api/openapi.yaml`. Pure wire types; the API
 * layer owns serialization, the mapper package owns the domain → DTO
 * translation (ADR-0003 §4).
 */
@Serializable
data class PuzzleResponse(
    val id: String,
    val title: String,
    val language: String,
    val width: Int,
    val height: Int,
    val cells: List<CellDto>,
    val clues: List<ClueDto>,
    val hintsAllowed: Int,
    val hintsRemaining: Int,
    val secondsUntilNextHint: JsonElement,
    val secondsUntilNextVerify: JsonElement,
    val createdAt: String,
    val difficulty: DifficultyDto? = null,
    val gridNumber: Int? = null,
)

/**
 * `Cell` discriminated union (`kind` field). Matches the OpenAPI spec's
 * `oneOf` with `discriminator: { propertyName: kind, mapping: { ... } }`.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("kind")
sealed interface CellDto {
    val position: PositionDto

    @Serializable
    data class PositionDto(
        val row: Int,
        val column: Int,
    )
}

@Serializable
@SerialName("letter")
data class LetterCellDto(
    override val position: CellDto.PositionDto,
) : CellDto

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@SerialName("definition")
data class DefinitionCellDto(
    override val position: CellDto.PositionDto,
    val clueId: String,
    val text: String,
    val arrow: String,
    // Force-emit []: kotlinx omits a default list, but the generated frontend type is non-optional (schema `default: []`).
    @EncodeDefault(EncodeDefault.Mode.ALWAYS)
    val separators: List<Int> = emptyList(),
) : CellDto

@Serializable
@SerialName("block")
data class BlockCellDto(
    override val position: CellDto.PositionDto,
) : CellDto

@Serializable
data class ClueDto(
    val id: String,
    val direction: String,
    val start: CellDto.PositionDto,
    val length: Int,
    val text: String,
)
