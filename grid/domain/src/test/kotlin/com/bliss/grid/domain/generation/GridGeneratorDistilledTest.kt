package com.bliss.grid.domain.generation

import assertk.assertThat
import assertk.assertions.isEqualTo
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
    fun `generateDistilled returns null (not throw, not hang) when no template is fillable`() {
        // Empty corpus -> every template attempt's dense generation fails; the loop must exhaust to null, not NPE or spin.
        val emptyGen = GridGenerator(ListWordRepository(emptyList()))
        val c = GridConstraints(width = 9, height = 9, minWordLength = minLen)
        assertThat(emptyGen.generateDistilled(c, Random(1), timeoutMs = 500L)).isNull()
    }

    @Test
    fun `firstFillableTemplate retries past a failed template and returns the first that fills`() {
        val filledGrid = gen.generate(GridConstraints(width = 9, height = 9, minWordLength = minLen), Random(1))!!
        var produced = 0
        val result =
            gen.firstFillableTemplate(Random(1), attempts = 3) {
                produced++
                if (produced < 2) null else filledGrid
            }
        assertThat(result).isEqualTo(filledGrid)
        assertThat(produced).isEqualTo(2) // failed once, recovered on the 2nd -- guards a repeat(1) mutation
    }

    @Test
    fun `firstFillableTemplate returns null after exhausting every attempt`() {
        var produced = 0
        val result =
            gen.firstFillableTemplate(Random(1), attempts = 3) {
                produced++
                null
            }
        assertThat(result).isNull()
        assertThat(produced).isEqualTo(3)
    }

    @Test
    fun `generateDistilled falls back to an Inert fill when the cooldown blocks every clue`() {
        // A total cooldown makes the served (cooldown) fill fail on every template; the fallback must still serve a grid, flagged.
        val allOnCooldown = ClueCooldownPolicy { true }
        val c = GridConstraints(width = 9, height = 9, minWordLength = minLen)
        val result = gen.generateDistilled(c, Random(1), timeoutMs = 6_000L, distillFillCheckMs = 300L, cooldownPolicy = allOnCooldown)
        assertThat(result).isNotNull()
        assertThat(result!!.usedCooldownFallback).isEqualTo(true)
    }

    @Test
    fun `generateDistilled produces a valid grid`() {
        // The whitens-only density invariant lives in BackoffDistillerTest (generateDistilled now reseeds each template attempt internally).
        val c = GridConstraints(width = 9, height = 9, minWordLength = minLen)
        val distilled = gen.generateDistilled(c, Random(3), timeoutMs = 6_000L, distillFillCheckMs = 300L)

        assertThat(distilled).isNotNull()
        assertThat(distilled!!.grid.width).isEqualTo(9)
        assertThat(distilled.usedCooldownFallback).isEqualTo(false)
    }
}
