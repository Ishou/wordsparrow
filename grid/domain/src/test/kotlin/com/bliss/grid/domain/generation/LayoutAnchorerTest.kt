package com.bliss.grid.domain.generation

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isGreaterThanOrEqualTo
import com.bliss.grid.domain.model.Word
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.fail
import kotlin.random.Random

class LayoutAnchorerTest {
    private val lex = Lexicon(ListWordRepository(DENSE_SYNTHETIC_WORDS))
    private val lUseful = lex.usefulLength

    @Test
    fun `carve extends the longest run in an anchored row to at least anchorLen`() {
        for (seed in 1L..40L) {
            val cells = seededCells(Random(seed))
            val carved = LayoutAnchorer.carve(cells, minLen = 2, lUseful = lUseful, lexicon = lex, anchorCount = 1, anchorLen = 6)
            if (carved == 0) continue
            assertThat(maxRowRun(cells)).isGreaterThanOrEqualTo(6)
            return
        }
        fail("no seed produced a carved anchor run across 40 attempts")
    }

    @Test
    fun `carve is a no-op when anchorCount is zero`() {
        val cells = seededCells(Random(1L))
        val before = maxRowRun(cells)
        val carved = LayoutAnchorer.carve(cells, minLen = 2, lUseful = lUseful, lexicon = lex, anchorCount = 0, anchorLen = 6)
        assertThat(carved).isEqualTo(0)
        assertThat(maxRowRun(cells)).isEqualTo(before)
    }

    private fun seededCells(random: Random): CellArray =
        BlackCellLayout.seed(
            width = 7,
            height = 7,
            minLen = 2,
            lTarget = 5,
            lUseful = lUseful,
            blackRatio = GenerationKnobs.DEFAULT_BLACK_RATIO,
            random = random,
            lMinGood = 2,
            lengthTwoPenalty = 0.0,
            lTargetHorizontal = 5,
            lTargetVertical = 4,
        )

    private fun maxRowRun(cells: CellArray): Int {
        var best = 0
        for (r in 0 until cells.height) {
            var run = 0
            for (c in 0 until cells.width) {
                if (cells.isBlack(r, c)) {
                    run = 0
                } else {
                    run++
                    if (run > best) best = run
                }
            }
        }
        return best
    }
}

/** 5-letter-alphabet corpus, dense per length so almost any crossing pattern resolves. */
internal val DENSE_SYNTHETIC_WORDS: List<Word> =
    listOf("A", "E", "I", "R", "S")
        .let { letters ->
            (2..7)
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
        }
