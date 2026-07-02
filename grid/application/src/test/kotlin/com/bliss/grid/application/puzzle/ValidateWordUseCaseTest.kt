package com.bliss.grid.application.puzzle

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import com.bliss.grid.domain.model.Column
import com.bliss.grid.domain.model.Direction
import com.bliss.grid.domain.model.Grid
import com.bliss.grid.domain.model.Position
import com.bliss.grid.domain.model.Row
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordPlacement
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class ValidateWordUseCaseTest {
    // PAIN placed at (0,0) Direction.RIGHT: clue at (0,0), letters P,A,I,N at (0,1)..(0,4).
    private val grid =
        Grid.fromPlacements(
            width = 5,
            height = 3,
            placements =
                listOf(
                    WordPlacement(
                        Word(text = "PAIN", definition = "bread"),
                        Position(Row(0), Column(0)),
                        Direction.RIGHT,
                    ),
                ),
        )

    @Test
    fun `correct=true when every submitted cell matches the solution`() {
        val (puzzleId, store) = stored()
        val outcome =
            ValidateWordUseCase(store).execute(
                puzzleId,
                listOf(
                    FilledCellInput(0, 1, "P"),
                    FilledCellInput(0, 2, "A"),
                    FilledCellInput(0, 3, "I"),
                    FilledCellInput(0, 4, "N"),
                ),
            )
        assertThat(outcome).isInstanceOf(ValidateWordOutcome.Result::class)
        assertThat((outcome as ValidateWordOutcome.Result).correct).isEqualTo(true)
    }

    @Test
    fun `correct=false when a single letter is wrong - canonical letter not leaked`() {
        val (puzzleId, store) = stored()
        val outcome =
            ValidateWordUseCase(store).execute(
                puzzleId,
                listOf(
                    FilledCellInput(0, 1, "P"),
                    FilledCellInput(0, 2, "A"),
                    FilledCellInput(0, 3, "X"), // wrong; canonical is I
                    FilledCellInput(0, 4, "N"),
                ),
            )
        assertThat((outcome as ValidateWordOutcome.Result).correct).isEqualTo(false)
    }

    @Test
    fun `RequestInvalid when fewer than two cells are submitted`() {
        val (puzzleId, store) = stored()
        val outcome =
            ValidateWordUseCase(store).execute(
                puzzleId,
                listOf(FilledCellInput(0, 1, "P")),
            )
        assertThat(outcome).isInstanceOf(ValidateWordOutcome.RequestInvalid::class)
    }

    @Test
    fun `RequestInvalid when cells do not form a contiguous span`() {
        val (puzzleId, store) = stored()
        val outcome =
            ValidateWordUseCase(store).execute(
                puzzleId,
                listOf(
                    FilledCellInput(0, 1, "P"),
                    FilledCellInput(0, 3, "I"), // gap at column 2
                ),
            )
        assertThat(outcome).isInstanceOf(ValidateWordOutcome.RequestInvalid::class)
    }

    @Test
    fun `RequestInvalid when a cell points at a non-letter cell`() {
        val (puzzleId, store) = stored()
        val outcome =
            ValidateWordUseCase(store).execute(
                puzzleId,
                listOf(
                    FilledCellInput(0, 0, "P"), // (0,0) is the clue cell
                    FilledCellInput(0, 1, "P"),
                ),
            )
        assertThat(outcome).isInstanceOf(ValidateWordOutcome.RequestInvalid::class)
    }

    @Test
    fun `PuzzleNotFound when store is empty`() {
        val store = fakeStore(emptyMap())
        val outcome =
            ValidateWordUseCase(store).execute(
                UUID.randomUUID(),
                listOf(
                    FilledCellInput(0, 1, "P"),
                    FilledCellInput(0, 2, "A"),
                ),
            )
        assertThat(outcome).isInstanceOf(ValidateWordOutcome.PuzzleNotFound::class)
    }

    private fun stored(): Pair<UUID, PuzzleRepository> {
        val id = UUID.randomUUID()
        val stored =
            StoredPuzzle(
                grid = grid,
                title = "T",
                language = "fr",
                hintsAllowed = 3,
                createdAt = Instant.parse("2026-04-24T15:30:00Z"),
            )
        return id to fakeStore(mapOf(id to stored))
    }

    private fun fakeStore(seed: Map<UUID, StoredPuzzle>): PuzzleRepository {
        val store = ConcurrentHashMap(seed)
        return object : PuzzleRepository {
            override fun get(puzzleId: UUID): StoredPuzzle? = store[puzzleId]

            override fun getOrCompute(
                puzzleId: UUID,
                factory: () -> StoredPuzzle?,
            ): StoredPuzzle? = store[puzzleId] ?: factory()?.also { store[puzzleId] = it }
        }
    }
}
