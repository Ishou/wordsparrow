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
import com.bliss.grid.domain.model.WordClue
import com.bliss.grid.domain.model.WordPlacement
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class ResolveWordUseCaseTest {
    // PAIN (clue "du pain quotidien") crosses ILE (clue "terre entourée d'eau") at (1,1).
    private val grid =
        Grid.fromPlacements(
            width = 5,
            height = 5,
            placements =
                listOf(
                    WordPlacement(
                        Word(text = "PAIN", definition = "du pain quotidien"),
                        Position(Row(1), Column(0)),
                        Direction.RIGHT,
                    ),
                    WordPlacement(
                        Word(text = "AILE", definition = "membre du vol"),
                        Position(Row(0), Column(2)),
                        Direction.DOWN,
                    ),
                ),
        )

    @Test
    fun `Resolved with the placed word when a clue matches`() {
        val (puzzleId, store) = stored()
        val outcome = ResolveWordUseCase(store).execute(puzzleId, "du pain quotidien")
        assertThat(outcome).isInstanceOf(ResolveWordOutcome.Resolved::class)
        assertThat((outcome as ResolveWordOutcome.Resolved).word).isEqualTo("PAIN")
    }

    @Test
    fun `Resolved matches the correct placement among several`() {
        val (puzzleId, store) = stored()
        val outcome = ResolveWordUseCase(store).execute(puzzleId, "membre du vol")
        assertThat(outcome).isInstanceOf(ResolveWordOutcome.Resolved::class)
        assertThat((outcome as ResolveWordOutcome.Resolved).word).isEqualTo("AILE")
    }

    @Test
    fun `matches the chosen clue text, not other candidate clues`() {
        val word =
            Word(
                text = "EST",
                clues = listOf(WordClue("forme du verbe etre"), WordClue("point cardinal", theme = "compass")),
                lemma = "ETRE",
            )
        val chosen = word.clues[1]
        val gridWithChoice =
            Grid.fromPlacements(
                width = 5,
                height = 1,
                placements =
                    listOf(
                        WordPlacement(word, Position(Row(0), Column(0)), Direction.RIGHT, chosenClue = chosen),
                    ),
            )
        val (puzzleId, store) = stored(gridWithChoice)

        assertThat(ResolveWordUseCase(store).execute(puzzleId, "point cardinal"))
            .isInstanceOf(ResolveWordOutcome.Resolved::class)
        assertThat(ResolveWordUseCase(store).execute(puzzleId, "forme du verbe etre"))
            .isInstanceOf(ResolveWordOutcome.ClueNotFound::class)
    }

    @Test
    fun `ClueNotFound when no placement carries the clue text`() {
        val (puzzleId, store) = stored()
        val outcome = ResolveWordUseCase(store).execute(puzzleId, "indice absent")
        assertThat(outcome).isInstanceOf(ResolveWordOutcome.ClueNotFound::class)
    }

    @Test
    fun `ClueNotFound when the puzzle does not exist`() {
        val store = fakeStore(emptyMap())
        val outcome = ResolveWordUseCase(store).execute(UUID.randomUUID(), "du pain quotidien")
        assertThat(outcome).isInstanceOf(ResolveWordOutcome.ClueNotFound::class)
    }

    private fun stored(grid: Grid = this.grid): Pair<UUID, PuzzleRepository> {
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
