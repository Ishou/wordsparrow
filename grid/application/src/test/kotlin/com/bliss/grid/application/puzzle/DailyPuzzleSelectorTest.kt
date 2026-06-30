package com.bliss.grid.application.puzzle

import assertk.assertThat
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test
import java.time.LocalDate

/** Unit tests for [DailyPuzzleSelector]. */
class DailyPuzzleSelectorTest {
    private val selector = DailyPuzzleSelector()

    @Test
    fun `freshDailyId is a UUID v7 carrying the supplied timestamp`() {
        val nowEpochMs =
            LocalDate
                .of(2026, 5, 9)
                .atStartOfDay(java.time.ZoneOffset.UTC)
                .toInstant()
                .toEpochMilli()
        val id = selector.freshDailyId(nowEpochMs)
        assertThat(id.version()).isEqualTo(7)
        assertThat(id.variant()).isEqualTo(2)
        // Top 48 bits of the most-significant half are the unix-ms timestamp.
        assertThat(id.mostSignificantBits ushr 16).isEqualTo(nowEpochMs)
    }

    @Test
    fun `freshDailyId differs across calls for the same timestamp`() {
        val nowEpochMs = 1_777_000_000_000L
        val a = selector.freshDailyId(nowEpochMs)
        val b = selector.freshDailyId(nowEpochMs)
        assertThat(a == b).isEqualTo(false)
    }

    @Test
    fun `gridNumber starts at 1 on the launch day`() {
        // `LAUNCH_EPOCH_DAY` = 2026-01-01.
        assertThat(selector.gridNumberForDate(LocalDate.of(2026, 1, 1))).isEqualTo(1)
    }

    @Test
    fun `gridNumber increments by one per day`() {
        val a = selector.gridNumberForDate(LocalDate.of(2026, 5, 9))
        val b = selector.gridNumberForDate(LocalDate.of(2026, 5, 10))
        assertThat(b - a).isEqualTo(1)
    }

    @Test
    fun `difficulty is hardcoded to facile in v1`() {
        // Heuristics PR will replace this — failing the test is the
        // correct signal that callers need to update.
        assertThat(selector.difficultyForDate(LocalDate.of(2026, 5, 9))).isEqualTo("facile")
    }
}
