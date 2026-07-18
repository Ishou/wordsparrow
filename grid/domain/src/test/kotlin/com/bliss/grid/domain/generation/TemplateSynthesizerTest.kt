package com.bliss.grid.domain.generation

import assertk.assertThat
import assertk.assertions.isLessThanOrEqualTo
import assertk.assertions.isNotNull
import org.junit.jupiter.api.Test
import kotlin.random.Random

class TemplateSynthesizerTest {
    private val structLex = structuralLexicon(maxLen = 30)

    private fun longestRun(
        cells: CellArray,
        w: Int,
        h: Int,
    ): Int {
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

    private fun blackFraction(
        cells: CellArray,
        w: Int,
        h: Int,
    ) = (0 until h).sumOf { r -> (0 until w).count { c -> cells.isBlack(r, c) } }.toDouble() / (w * h)

    @Test
    fun `synthesizes valid run-capped templates including widths above the lexicon cap`() {
        val minLen = 2
        val maxRun = 13
        // 20x15 and 22x15 widths exceed LEXICON_MAX_LEN(18) — the case the structural lexicon fixes.
        for ((w, h) in listOf(12 to 15, 15 to 15, 20 to 15, 22 to 15)) {
            var produced = 0
            for (seed in 0L until 15L) {
                val cells =
                    TemplateSynthesizer.synthesize(w, h, minLen, maxRun, blackFraction = 0.18, random = Random(seed), structLex = structLex)
                        ?: continue
                produced++
                // Structurally valid (build against any-length structLex reflects pure structural validity).
                assertThat(SlotRegistry.build(cells, structLex, minLen)).isNotNull()
                // Every white run within the cap.
                assertThat(longestRun(cells, w, h)).isLessThanOrEqualTo(maxRun)
                // Airy, near the target (never dense).
                assertThat(blackFraction(cells, w, h)).isLessThanOrEqualTo(0.24)
                if (produced >= 3) break
            }
            check(produced > 0) { "no valid template produced at ${w}x$h" }
        }
    }

    @Test
    fun `structural lexicon covers every length up to maxLen`() {
        // A 25-long run must not null the build check -- that is what the padding guarantees.
        for (len in 2..30) check(structLex.count(len) > 0) { "structuralLexicon missing length $len" }
    }
}
