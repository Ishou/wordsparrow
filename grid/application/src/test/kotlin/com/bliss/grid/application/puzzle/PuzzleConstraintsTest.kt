package com.bliss.grid.application.puzzle

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import org.junit.jupiter.api.Test
import java.time.LocalDate

class PuzzleConstraintsTest {
    @Test
    fun `daily grid size is the big 22x15 on Sunday and the compact 15x12 otherwise`() {
        assertThat(dailyGridSize(LocalDate.of(2026, 8, 2))).isEqualTo(22 to 15) // Sunday
        assertThat(dailyGridSize(LocalDate.of(2026, 8, 3))).isEqualTo(15 to 12) // Monday
        assertThat(dailyGridSize(LocalDate.of(2026, 8, 8))).isEqualTo(15 to 12) // Saturday
    }

    @Test
    fun `distilled daily base is bare 15x12 without the ADR-0095 dense knobs`() {
        val base = distilledDailyBaseConstraints()
        assertThat(base.width).isEqualTo(15)
        assertThat(base.height).isEqualTo(12)
        assertThat(base.anchorCount).isEqualTo(0)
        assertThat(base.lTargetHorizontal).isNull()
        assertThat(base.lTargetVertical).isNull()
    }

    @Test
    fun `default constraints stay at the 28x20 API default`() {
        val defaults = defaultPuzzleConstraints()
        assertThat(defaults.width).isEqualTo(28)
        assertThat(defaults.height).isEqualTo(20)
        assertThat(defaults.anchorCount).isEqualTo(3)
        assertThat(defaults.lTargetHorizontal).isEqualTo(11)
        assertThat(defaults.lTargetVertical).isEqualTo(8)
    }

    @Test
    fun `daily constraints run the smaller 22x15 grid with re-scaled low-density knobs`() {
        val daily = dailyPuzzleConstraints()
        assertThat(daily.width).isEqualTo(22)
        assertThat(daily.height).isEqualTo(15)
        assertThat(daily.anchorCount).isEqualTo(3)
        assertThat(daily.anchorLength).isEqualTo(10)
        assertThat(daily.lTargetHorizontal).isEqualTo(9)
        assertThat(daily.lTargetVertical).isEqualTo(6)
    }
}
