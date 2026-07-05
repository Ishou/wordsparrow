package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.isEmpty
import com.bliss.grid.domain.model.Column
import com.bliss.grid.domain.model.Direction
import com.bliss.grid.domain.model.Grid
import com.bliss.grid.domain.model.Position
import com.bliss.grid.domain.model.Row
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordPlacement
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Test

/** Regression: compound separators must survive the persisted-payload round-trip (ADR-0096). */
class PuzzlePayloadCompoundTest {
    private fun pos(
        r: Int,
        c: Int,
    ): Position = Position(Row(r), Column(c))

    @Test
    fun `compound word separators survive the payload round-trip`() {
        val grid =
            Grid.fromPlacements(
                width = 10,
                height = 9,
                placements =
                    listOf(
                        WordPlacement(Word("ARCENCIEL", "Phénomène coloré", separators = listOf(3, 5)), pos(0, 0), Direction.RIGHT),
                    ),
            )

        val json = Json.encodeToString(PuzzlePayload.serializer(), PuzzlePayload.fromGrid(grid))
        val restored = Json.decodeFromString(PuzzlePayload.serializer(), json).toGrid()

        assertThat(
            restored.placements
                .single()
                .word.separators,
        ).containsExactly(3, 5)
    }

    @Test
    fun `a pre-ADR-0096 payload with no separators field loads as a plain word`() {
        val legacy =
            """{"width":5,"height":5,"placements":[{"wordText":"CHAT","wordLemma":"CHAT",""" +
                """"clues":[{"text":"felin"}],"chosenClueIndex":0,"cluePositionRow":0,""" +
                """"cluePositionColumn":0,"direction":"RIGHT"}]}"""

        val grid = Json.decodeFromString(PuzzlePayload.serializer(), legacy).toGrid()

        assertThat(
            grid.placements
                .single()
                .word.separators,
        ).isEmpty()
    }
}
