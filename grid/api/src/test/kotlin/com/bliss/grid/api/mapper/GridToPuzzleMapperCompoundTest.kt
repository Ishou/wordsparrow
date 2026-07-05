package com.bliss.grid.api.mapper

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import com.bliss.grid.api.dto.DefinitionCellDto
import com.bliss.grid.domain.model.Column
import com.bliss.grid.domain.model.Direction
import com.bliss.grid.domain.model.Grid
import com.bliss.grid.domain.model.Position
import com.bliss.grid.domain.model.Row
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordPlacement
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

/** Contract tests for [GridToPuzzleMapper]'s emission of `DefinitionCellDto.separators`. */
class GridToPuzzleMapperCompoundTest {
    private val mapper = GridToPuzzleMapper()

    private fun pos(
        r: Int,
        c: Int,
    ): Position = Position(Row(r), Column(c))

    @Test
    fun `definition cell carries the word's separator offsets`() {
        val grid =
            Grid.fromPlacements(
                width = 10,
                height = 9,
                placements =
                    listOf(
                        WordPlacement(Word("ARCENCIEL", "Phénomène coloré", separators = listOf(3, 5)), pos(0, 0), Direction.RIGHT),
                    ),
            )

        val response = mapper.toApi(grid, UUID.randomUUID(), Instant.now(), hintsAllowed = 3)

        val def = response.cells.filterIsInstance<DefinitionCellDto>().single()
        assertThat(def.separators).isEqualTo(listOf(3, 5))
    }

    @Test
    fun `a plain word's definition cell still emits an explicit empty separators array on the wire`() {
        val grid =
            Grid.fromPlacements(
                width = 5,
                height = 5,
                placements =
                    listOf(
                        WordPlacement(Word("CHAT", "felin domestique"), pos(0, 0), Direction.RIGHT),
                    ),
            )

        val response = mapper.toApi(grid, UUID.randomUUID(), Instant.now(), hintsAllowed = 3)
        val def = response.cells.filterIsInstance<DefinitionCellDto>().single()
        assertThat(def.separators).isEqualTo(emptyList())

        val wireJson =
            Json {
                prettyPrint = false
                ignoreUnknownKeys = true
                explicitNulls = false
            }
        val encoded = wireJson.encodeToString(def)
        assertThat(encoded).contains("\"separators\":[]")
    }
}
