package com.bliss.grid.application.puzzle

import assertk.assertThat
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test

class PuzzleConstraintsTest {
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
