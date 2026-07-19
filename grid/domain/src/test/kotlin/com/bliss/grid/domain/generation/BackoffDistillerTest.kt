package com.bliss.grid.domain.generation

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isLessThan
import assertk.assertions.isNotNull
import org.junit.jupiter.api.Test
import kotlin.random.Random

class BackoffDistillerTest {
    private val structLex = structuralLexicon(maxLen = 30)
    private val minLen = 2
    private val w = 15
    private val h = 15

    private fun longestRun(cells: CellArray): Int {
        var best = 0
        for (r in 0 until h) {
            var run = 0
            for (c in 0 until w) {
                run = if (cells.isBlack(r, c)) 0 else run + 1
                if (run > best) best = run
            }
        }
        for (c in 0 until w) {
            var run = 0
            for (r in 0 until h) {
                run = if (cells.isBlack(r, c)) 0 else run + 1
                if (run > best) best = run
            }
        }
        return best
    }

    private val cap = 13

    /** A dense starting layout: runs <= 10 (< cap, so it "fills"), denser than the distilled frontier. */
    private fun denseStart(): CellArray {
        for (s in 0L until 30L) {
            val cells =
                TemplateSynthesizer.synthesize(
                    w,
                    h,
                    minLen,
                    maxRun = 10,
                    blackFraction = 0.28,
                    random = Random(s),
                    structLex = structLex,
                )
            if (cells != null) return cells
        }
        error("no dense start")
    }

    @Test
    fun `distill whitens blacks while keeping the board fillable`() {
        val start = denseStart()
        val startBlacks = start.countBlack()
        val fills: (CellArray) -> Boolean = { longestRun(it) <= cap }
        check(fills(start)) { "dense start should fill under cap $cap" }

        val result = BackoffDistiller.distill(start, minLen, structLex, fills)

        // Airier than the start.
        assertThat(result.countBlack()).isLessThan(startBlacks)
        // Still structurally valid and still "fills".
        assertThat(SlotRegistry.build(result, structLex, minLen)).isNotNull()
        check(fills(result)) { "result must still fill" }
        // Start is untouched (distillation ran on a copy).
        assertThat(start.countBlack()).isEqualTo(startBlacks)
    }

    @Test
    fun `distill reaches a local optimum - no further interior removal keeps it fillable`() {
        val fills: (CellArray) -> Boolean = { longestRun(it) <= cap }
        val result = BackoffDistiller.distill(denseStart(), minLen, structLex, fills)
        // Removing any remaining interior black would break structural validity or the fill check.
        for (r in 1 until h) {
            for (c in 1 until w) {
                if (!result.isBlack(r, c)) continue
                val probe = result.copy()
                probe.set(r, c, CellArray.EMPTY)
                check(SlotRegistry.build(probe, structLex, minLen) == null || !fills(probe)) {
                    "black at ($r,$c) was removable but distillation stopped -- not a local optimum"
                }
            }
        }
    }

    @Test
    fun `distill keeps a layout that cannot be thinned unchanged`() {
        val start = denseStart()
        val never: (CellArray) -> Boolean = { false } // no removal ever "fills"
        val result = BackoffDistiller.distill(start, minLen, structLex, never)
        assertThat(result.countBlack()).isEqualTo(start.countBlack())
    }
}
