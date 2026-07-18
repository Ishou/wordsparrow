package com.bliss.grid.api

import com.bliss.grid.domain.generation.GridConstraints
import com.bliss.grid.domain.generation.GridGenerator
import com.bliss.grid.domain.generation.LongWordCoverage
import com.bliss.grid.domain.model.ClueCell
import com.bliss.grid.domain.model.Grid
import org.junit.jupiter.api.Assumptions
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import kotlin.random.Random

/**
 * Grid-size / aspect-ratio sweep (spec 2026-07-14 follow-up): does geometry move
 * the long-word ceiling? Same production-style policy (anchor 3, caps 11/8) +
 * best-of-N by coverage at each size. Reports per-area-normalised coverage and an
 * ABSOLUTE long-word count (words >= 10 letters, fixed threshold) so sizes compare.
 * Opt-in via the `bench` tag.
 */
@Tag("bench")
class GridSizeSweepTest {
    private val log = LoggerFactory.getLogger(GridSizeSweepTest::class.java)

    private data class Size(val w: Int, val h: Int)

    @Test
    fun `sweep long-word density across grid sizes and aspect ratios`() {
        Assumptions.assumeTrue(FullSurfaceCorpus.available(), "production surface CSVs not present")
        val generator = GridGenerator(FullSurfaceCorpus.load())
        repeat(WARMUP) { generator.generate(constraintsFor(Size(28, 20)), Random(it.toLong())) }

        val sizes =
            listOf(
                Size(15, 11), Size(20, 15), Size(22, 15), Size(24, 18),
                Size(28, 20), Size(30, 22),
                Size(34, 16), Size(16, 28), Size(24, 24),
            )

        log.info("sizesweep_start puzzles={} bestOfN={} abs_long_threshold={}", PUZZLES, BEST_OF_N, ABS_LONG)
        for (size in sizes) {
            val constraints = constraintsFor(size)
            val area = size.w * size.h
            val minLen = constraints.minWordLength
            var ok = 0
            var sumCov = 0L
            var sumAbsLong = 0
            var sumWordLen = 0.0
            var sumWords = 0
            var sumClue = 0
            val genMs = mutableListOf<Long>()
            repeat(PUZZLES) { p ->
                var best: Grid? = null
                var bestCov = -1L
                for (candidate in 0 until BEST_OF_N) {
                    val seed = (size.w * 1_000_003L) + (size.h * 9_973L) + p * 131L + candidate
                    val start = System.nanoTime()
                    val grid = generator.generate(constraints, Random(seed))
                    genMs += (System.nanoTime() - start) / 1_000_000
                    if (grid == null) continue
                    val cov = LongWordCoverage.coverageOf(grid, minLen)
                    if (cov > bestCov) {
                        bestCov = cov
                        best = grid
                    }
                }
                val grid = best ?: return@repeat
                ok++
                sumCov += bestCov
                sumAbsLong += grid.placements.count { it.word.text.length >= ABS_LONG }
                sumWordLen += grid.placements.sumOf { it.word.text.length }
                sumWords += grid.placements.size
                sumClue += grid.cells.values.count { it is ClueCell }
            }
            val covPerK = if (ok > 0) sumCov.toDouble() / ok / area * 1000 else 0.0
            val absLongPerK = if (ok > 0) sumAbsLong.toDouble() / ok / area * 1000 else 0.0
            log.info(
                "sizesweep w={} h={} area={} success={}/{} cov_mean={} cov_per_kcell={} abs_long_mean={} " +
                    "abs_long_per_kcell={} mean_word_len={} clue_density={} gen_p50ms={}",
                size.w, size.h, area, ok, PUZZLES,
                if (ok > 0) sumCov / ok else 0,
                "%.1f".format(covPerK),
                if (ok > 0) sumAbsLong / ok else 0,
                "%.2f".format(absLongPerK),
                if (sumWords > 0) "%.2f".format(sumWordLen / sumWords) else "0",
                if (ok > 0) "%.2f".format(sumClue.toDouble() / ok / area) else "0",
                genMs.sorted().let { if (it.isEmpty()) 0 else it[it.size / 2] },
            )
        }
    }

    private fun constraintsFor(size: Size): GridConstraints =
        GridConstraints(
            width = size.w,
            height = size.h,
            minWordLength = 2,
            anchorCount = 3,
            lTargetHorizontal = 11,
            lTargetVertical = 8,
        )

    private companion object {
        const val WARMUP = 3
        const val PUZZLES = 6
        const val BEST_OF_N = 6
        const val ABS_LONG = 10
    }
}
