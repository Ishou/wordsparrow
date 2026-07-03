package com.bliss.grid.domain.generation

import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.validation.GridValidator
import com.bliss.grid.domain.validation.GridViolation
import io.kotest.common.ExperimentalKotest
import io.kotest.property.Arb
import io.kotest.property.PropTestConfig
import io.kotest.property.arbitrary.int
import io.kotest.property.checkAll
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test

@OptIn(ExperimentalKotest::class)
class GridGeneratorPropertyTest {
    private val generator = GridGenerator(ListWordRepository(SMALL_FRENCH_WORDS))

    @Test
    fun `every generated grid has no orphan cell - each letter is in at least one word`() {
        runBlocking {
            checkAll(
                PropTestConfig(iterations = 20),
                Arb.int(4..6),
                Arb.int(4..6),
            ) { width, height ->
                val grid = generator.generate(GridConstraints(width, height))
                if (grid != null) {
                    val orphans = GridValidator.uncrossedCells(grid)
                    check(orphans.isEmpty()) {
                        "orphan (unfillable) cells $orphans for ${width}x$height"
                    }
                }
            }
        }
    }

    @Test
    fun `no generated word shorter than five ends in a dead end`() {
        // Synthetic 5-letter-alphabet corpus: crossings are easy, so 12x10
        // grids fill and interior black cells (pocket material) exist.
        val letters = listOf("A", "E", "I", "R", "S")
        val syntheticWords =
            (2..5)
                .flatMap { len ->
                    (0 until 400).map { i ->
                        buildString {
                            var x = i
                            repeat(len) {
                                append(letters[x % letters.size])
                                x /= letters.size
                            }
                        }
                    }
                }.distinct()
                .map { Word(it, "clue $it") }
        val syntheticGenerator = GridGenerator(ListWordRepository(syntheticWords))
        runBlocking {
            checkAll(
                PropTestConfig(iterations = 15),
                Arb.int(10..12),
                Arb.int(9..11),
            ) { width, height ->
                val grid = syntheticGenerator.generate(GridConstraints(width, height))
                if (grid != null) {
                    val deadEnds =
                        GridValidator()
                            .validate(grid)
                            .filterIsInstance<GridViolation.ShortDeadEnd>()
                    check(deadEnds.isEmpty()) {
                        "short dead-end words $deadEnds for ${width}x$height"
                    }
                }
            }
        }
    }
}
