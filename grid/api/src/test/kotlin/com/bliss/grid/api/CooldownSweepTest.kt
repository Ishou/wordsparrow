package com.bliss.grid.api

import com.bliss.grid.application.puzzle.GeneratePuzzleUseCase
import com.bliss.grid.application.puzzle.defaultPuzzleConstraints
import com.bliss.grid.domain.generation.ClueCooldownPolicy
import com.bliss.grid.domain.generation.ClueId
import com.bliss.grid.infrastructure.persistence.CsvWordRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import kotlin.random.Random

// Regression guard for the ADR-0031 short-word cooldown starvation; see docs/superpowers/plans/2026-07-03-short-word-cooldown-fix.md
@Tag("bench")
class CooldownSweepTest {
    private data class SweepResult(
        val cm: Int,
        val generations: Int,
        val failures: Int,
        val avgAttempts: Double,
        val maxAttempts: Int,
        val avgDistinctLen2: Double,
        val avgDistinctLen3: Double,
    )

    @Test
    fun `28x20 daily generation survives accumulating clue cooldowns at cm=8`() {
        val repo = CsvWordRepository.frenchFromClasspath()
        val results = intArrayOf(2, 4, 8).map { cm -> sweep(repo, cm) }

        println()
        println("=== cooldown sweep, 28x20, ${results.first().generations} sequential daily generations ===")
        println("| cm | failures | avg attempts | max attempts | avg distinct len-2 | avg distinct len-3 |")
        println("|----|----------|--------------|--------------|--------------------|--------------------|")
        for (r in results) {
            println(
                "| %d | %d | %.2f | %d | %.1f | %.1f |".format(
                    r.cm,
                    r.failures,
                    r.avgAttempts,
                    r.maxAttempts,
                    r.avgDistinctLen2,
                    r.avgDistinctLen3,
                ),
            )
        }
        println()

        val atProdCooldown = results.last()
        assertEquals(
            0,
            atProdCooldown.failures,
            "28x20 starved under cm=${atProdCooldown.cm} cooldown: " +
                "${atProdCooldown.failures}/${atProdCooldown.generations} generations failed " +
                "(avg attempts %.2f)".format(atProdCooldown.avgAttempts),
        )
    }

    private fun sweep(
        repo: CsvWordRepository,
        cm: Int,
        generations: Int = 20,
    ): SweepResult {
        val useCase = GeneratePuzzleUseCase(repo, defaultPuzzleConstraints())
        val coolUntil = HashMap<ClueId, Long>()
        val rollRandom = Random(cm)
        var failures = 0
        var totalAttempts = 0
        var maxAttempts = 0
        var len2Sum = 0
        var len3Sum = 0
        var successes = 0

        for (seq in 1L..generations) {
            val active = coolUntil.filterValues { it > seq }.keys
            val outcome =
                useCase.executeWithOutcome(
                    cooldownPolicy = ClueCooldownPolicy.fromSet(active),
                    randomFactory = { attempt -> Random(cm * 1_000_000L + seq * 1_000 + attempt) },
                    perAttemptTimeoutMsOverride = 3_000,
                )
            totalAttempts += outcome.attempts
            maxAttempts = maxOf(maxAttempts, outcome.attempts)
            val grid = outcome.grid
            if (grid == null) {
                failures++
                continue
            }
            successes++
            len2Sum += grid.placements.count { it.word.text.length == 2 }
            len3Sum += grid.placements.count { it.word.text.length == 3 }
            for (p in grid.placements) {
                coolUntil[ClueId(p.word.text, p.chosenClue.text)] = seq + 1 + rollRandom.nextInt(cm)
            }
        }
        return SweepResult(
            cm = cm,
            generations = generations,
            failures = failures,
            avgAttempts = totalAttempts.toDouble() / generations,
            maxAttempts = maxAttempts,
            avgDistinctLen2 = if (successes == 0) 0.0 else len2Sum.toDouble() / successes,
            avgDistinctLen3 = if (successes == 0) 0.0 else len3Sum.toDouble() / successes,
        )
    }
}
