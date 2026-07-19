package com.bliss.grid.domain.generation

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isLessThanOrEqualTo
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import org.junit.jupiter.api.Test
import kotlin.random.Random

class GridGeneratorDistilledTest {
    private val repo = ListWordRepository(DENSE_SYNTHETIC_WORDS) // lengths 2..7
    private val gen = GridGenerator(repo)
    private val minLen = 2

    @Test
    fun `fillLayout fills a layout a plain generation proved fillable`() {
        val c = GridConstraints(width = 9, height = 9, minWordLength = minLen)
        val base = gen.generate(c, Random(1)) ?: error("dense generation failed")
        val layout = gen.reconstructLayout(base, c.width, c.height)
        val filled = gen.fillLayout(layout, minLen, Random(2), timeoutMs = 5_000L)
        assertThat(filled).isNotNull()
        assertThat(filled!!.width).isEqualTo(9)
    }

    @Test
    fun `fillLayout returns null for a structurally unfillable layout`() {
        // All-white 8x2 -> horizontal slots of length 8; the corpus tops out at 7, so no words -> null.
        val cells = CellArray(8, 2)
        assertThat(gen.fillLayout(cells, minLen, Random(1), timeoutMs = 1_000L)).isNull()
    }

    @Test
    fun `generateDistilled produces a valid grid no denser than the dense start`() {
        val c = GridConstraints(width = 9, height = 9, minWordLength = minLen)
        val dense = gen.generate(c, Random(3)) ?: error("dense generation failed")
        val denseBlacks = gen.reconstructLayout(dense, c.width, c.height).countBlack()

        val distilled = gen.generateDistilled(c, Random(3), timeoutMs = 6_000L, distillFillCheckMs = 300L)

        assertThat(distilled).isNotNull()
        assertThat(distilled!!.width).isEqualTo(9)
        // Distillation only whitens, so the served grid is never denser than the dense start it came from.
        val distilledBlacks = gen.reconstructLayout(distilled, c.width, c.height).countBlack()
        assertThat(distilledBlacks).isLessThanOrEqualTo(denseBlacks)
    }
}
