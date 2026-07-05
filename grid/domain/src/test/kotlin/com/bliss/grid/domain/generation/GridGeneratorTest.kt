package com.bliss.grid.domain.generation

import assertk.assertThat
import assertk.assertions.isEmpty
import assertk.assertions.isNotEqualTo
import assertk.assertions.isNull
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.validation.GridValidator
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.fail
import kotlin.random.Random

class GridGeneratorTest {
    private val validator = GridValidator()

    @Test
    fun `returns null when width is less than 2`() {
        val generator = GridGenerator(ListWordRepository(SMALL_FRENCH_WORDS))
        assertThat(generator.generate(GridConstraints(width = 1, height = 5))).isNull()
    }

    @Test
    fun `returns null when minWordLength cannot be satisfied by any slot`() {
        val generator = GridGenerator(ListWordRepository(SMALL_FRENCH_WORDS))
        assertThat(generator.generate(GridConstraints(width = 5, height = 5, minWordLength = 100))).isNull()
    }

    @Test
    fun `returns null when word list has no words of required length`() {
        val generator = GridGenerator(ListWordRepository(emptyList()))
        assertThat(generator.generate(GridConstraints(width = 5, height = 5))).isNull()
    }

    @Test
    fun `any non-null grid satisfies structural validation invariants`() {
        val generator = GridGenerator(ListWordRepository(SMALL_FRENCH_WORDS))
        for (seed in 1L..20L) {
            val grid = generator.generate(GridConstraints(width = 5, height = 5), Random(seed)) ?: continue
            assertThat(validator.validate(grid)).isEmpty()
            return
        }
    }

    @Test
    fun `per-axis lTarget and anchor still produce structurally valid grids`() {
        val generator = GridGenerator(ListWordRepository(SMALL_FRENCH_WORDS))
        for (seed in 1L..40L) {
            val grid =
                generator.generate(
                    GridConstraints(
                        width = 7,
                        height = 7,
                        anchorCount = 1,
                        anchorLength = 5,
                        lTargetHorizontal = 5,
                        lTargetVertical = 4,
                    ),
                    Random(seed),
                ) ?: continue
            assertThat(validator.validate(grid)).isEmpty()
            return
        }
    }

    @Test
    fun `different random seeds produce different grids`() {
        val generator = GridGenerator(ListWordRepository(SMALL_FRENCH_WORDS))
        val constraints = GridConstraints(width = 5, height = 5)
        val grid1 = generator.generate(constraints, Random(1L))
        val grid2 = generator.generate(constraints, Random(2L))
        if (grid1 != null && grid2 != null) {
            assertThat(grid1.cells).isNotEqualTo(grid2.cells)
        }
    }

    @Test
    fun `reseedOrPerturb re-carves anchor runs on a forced full re-seed`() {
        val generator = GridGenerator(ListWordRepository(DENSE_SYNTHETIC_WORDS))
        val lex = Lexicon(ListWordRepository(DENSE_SYNTHETIC_WORDS))
        val lUseful = lex.usefulLength
        for (seed in 1L..40L) {
            val reseeded =
                generator.reseedOrPerturb(
                    cells = CellArray(7, 7),
                    w = 7,
                    h = 7,
                    minLen = 2,
                    lTarget = 5,
                    lUseful = lUseful,
                    lTargetH = 5,
                    lTargetV = 4,
                    hotCells = emptyList(),
                    consecFails = GenerationKnobs.CONSEC_RESEED,
                    random = Random(seed),
                    blackRatio = GenerationKnobs.DEFAULT_BLACK_RATIO,
                    lMinGood = 2,
                    whitenP = 0.4,
                    lengthTwoPenalty = 0.0,
                    lex = lex,
                    anchorCount = 1,
                    anchorLength = 6,
                )
            if (maxRowRun(reseeded) >= 6) return
        }
        fail("no seed produced an anchor-carved run on the full-re-seed branch across 40 attempts")
    }

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

    /** Guards that [GridGenerator.generate] forwards cooldownPolicy to the filler — see ADR-0031. */
    @Test
    fun `accepts cooldownPolicy parameter and produces a valid grid with Inert default`() {
        val generator = GridGenerator(ListWordRepository(SMALL_FRENCH_WORDS))
        for (seed in 1L..20L) {
            val grid =
                generator.generate(
                    GridConstraints(width = 5, height = 5),
                    Random(seed),
                    cooldownPolicy = ClueCooldownPolicy.Inert,
                ) ?: continue
            assertThat(validator.validate(grid)).isEmpty()
            return
        }
    }
}

internal val SMALL_FRENCH_WORDS: List<Word> =
    listOf(
        Word("OR", "metal precieux"),
        Word("OS", "anatomie"),
        Word("AS", "carte a jouer"),
        Word("DU", "article contracte"),
        Word("ET", "conjonction"),
        Word("UN", "article indefini"),
        Word("ON", "pronom"),
        Word("AIR", "atmosphere"),
        Word("EAU", "liquide vital"),
        Word("FEU", "combustion"),
        Word("RUE", "voie urbaine"),
        Word("SOL", "surface au sol"),
        Word("VIE", "existence"),
        Word("AMI", "compagnon"),
        Word("FIL", "ligne fine"),
        Word("BOL", "recipient"),
        Word("MUR", "paroi"),
        Word("NEZ", "organe olfactif"),
        Word("CHAT", "felin domestique"),
        Word("MAIN", "extremite du bras"),
        Word("ROSE", "fleur a epines"),
        Word("VENT", "air en mouvement"),
        Word("CHIEN", "canide domestique"),
        Word("LIVRE", "ouvrage relie"),
        Word("TABLE", "meuble plat"),
        Word("ARBRE", "vegetal a tronc"),
    )
