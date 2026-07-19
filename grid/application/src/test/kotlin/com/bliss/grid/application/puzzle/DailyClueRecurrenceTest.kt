package com.bliss.grid.application.puzzle

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isBetween
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isTrue
import com.bliss.grid.domain.generation.ClueId
import org.junit.jupiter.api.Test
import java.time.LocalDate

class DailyClueRecurrenceTest {
    private val target: LocalDate = LocalDate.of(2026, 7, 19)
    private val ete = ClueId("ETE", "saison la plus chaude")
    private val cle = ClueId("CLE", "ouvre la serrure")

    @Test
    fun `a pair used within the minimum gap is always forbidden regardless of its horizon`() {
        // Distance 1..minGap must be forbidden for every pair, so adjacent days never repeat.
        for (dayOffset in 1..MIN_GAP) {
            val neighbor = target.minusDays(dayOffset.toLong())
            val forbidden =
                DailyClueRecurrence.forbiddenPairs(
                    targetDate = target,
                    neighborPairsByDate = mapOf(neighbor to setOf(ete, cle)),
                    minGapDays = MIN_GAP,
                    maxGapDays = MAX_GAP,
                )
            assertThat(forbidden).contains(ete)
            assertThat(forbidden).contains(cle)
        }
    }

    @Test
    fun `a pair used beyond the maximum gap is never forbidden`() {
        val neighbor = target.minusDays((MAX_GAP + 1).toLong())
        val forbidden =
            DailyClueRecurrence.forbiddenPairs(
                targetDate = target,
                neighborPairsByDate = mapOf(neighbor to setOf(ete, cle)),
                minGapDays = MIN_GAP,
                maxGapDays = MAX_GAP,
            )
        assertThat(forbidden).isEmpty()
    }

    @Test
    fun `the target date's own pairs are never forbidden by itself`() {
        val forbidden =
            DailyClueRecurrence.forbiddenPairs(
                targetDate = target,
                neighborPairsByDate = mapOf(target to setOf(ete, cle)),
                minGapDays = MIN_GAP,
                maxGapDays = MAX_GAP,
            )
        assertThat(forbidden).isEmpty()
    }

    @Test
    fun `forbidding is symmetric - a frozen future neighbor is honored the same as a past one`() {
        // The July-11 regression: regenerating a date must avoid an already-frozen FUTURE day.
        val future = target.plusDays(1)
        val forbidden =
            DailyClueRecurrence.forbiddenPairs(
                targetDate = target,
                neighborPairsByDate = mapOf(future to setOf(ete)),
                minGapDays = MIN_GAP,
                maxGapDays = MAX_GAP,
            )
        assertThat(forbidden).contains(ete)
    }

    @Test
    fun `the per-use horizon is deterministic and stays within the configured range`() {
        val source = LocalDate.of(2026, 7, 10)
        val first = DailyClueRecurrence.horizonDays(ete, source, MIN_GAP, MAX_GAP)
        val second = DailyClueRecurrence.horizonDays(ete, source, MIN_GAP, MAX_GAP)
        assertThat(first).isBetween(MIN_GAP, MAX_GAP)
        assertThat(first).isEqualTo(second)
    }

    @Test
    fun `across many pairs the soft-zone horizon takes on more than one value`() {
        // The 6..10 band must actually vary, otherwise it is a fixed gap, not a random one.
        val source = LocalDate.of(2026, 7, 10)
        val horizons =
            (0..60)
                .map { DailyClueRecurrence.horizonDays(ete.copy(clueText = "clue-$it"), source, MIN_GAP, MAX_GAP) }
                .toSet()
        assertThat(horizons.all { it in MIN_GAP..MAX_GAP }).isTrue()
        assertThat(horizons.size > 1).isTrue()
    }

    private companion object {
        const val MIN_GAP = 5
        const val MAX_GAP = 10
    }
}
