package com.bliss.grid.api

import com.bliss.grid.application.puzzle.dailyPuzzleConstraints
import com.bliss.grid.domain.generation.GridConstraints
import com.bliss.grid.domain.generation.GridGenerator
import com.bliss.grid.domain.model.LetterCell
import com.bliss.grid.infrastructure.persistence.CsvWordRepository
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import kotlin.random.Random

/**
 * ADR-0095 feasibility gate for the 22×15 daily grid: proves the shipped
 * [dailyPuzzleConstraints] fill on the production corpus and reports the
 * definition-cell density. Opt-in via the `bench` tag.
 */
@Tag("bench")
class DailyGridFeasibilityProbeTest {
    private val log = LoggerFactory.getLogger(DailyGridFeasibilityProbeTest::class.java)

    @Test
    fun `22x15 daily constraints fill airy grids on the production corpus`() {
        val repo = CsvWordRepository.frenchFromClasspath()
        val generator = GridGenerator(repo)
        val constraints = dailyPuzzleConstraints()
        val area = constraints.width * constraints.height

        repeat(5) {
            generator.generate(
                GridConstraints(width = constraints.width, height = constraints.height, minWordLength = 2),
                Random(it.toLong()),
            )
        }

        val n = 12
        var success = 0
        var blackSum = 0
        var minBlack = Int.MAX_VALUE
        var maxTime = 0L
        for (seed in 0 until n) {
            val start = System.currentTimeMillis()
            val grid = generator.generate(constraints, Random(seed.toLong() * 1000))
            maxTime = maxOf(maxTime, System.currentTimeMillis() - start)
            if (grid != null) {
                success++
                val black = area - grid.cells.values.count { it is LetterCell }
                blackSum += black
                minBlack = minOf(minBlack, black)
            }
        }
        val avgBlackPct = 100.0 * (blackSum.toDouble() / success) / area
        log.info(
            "daily_feasibility width={} height={} success={}/{} avg_black_pct={} best_black_pct={} max_ms={}",
            constraints.width,
            constraints.height,
            success,
            n,
            "%.1f".format(avgBlackPct),
            "%.1f".format(100.0 * minBlack / area),
            maxTime,
        )
        assertTrue(success >= n - 1, "22×15 daily grid failed to fill: only $success/$n seeds produced a grid")
        assertTrue(maxTime < 5_000, "22×15 daily generation exceeded the 5s feasibility budget: ${maxTime}ms")
    }
}
