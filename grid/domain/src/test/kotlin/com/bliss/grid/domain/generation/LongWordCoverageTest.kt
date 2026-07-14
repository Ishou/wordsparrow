package com.bliss.grid.domain.generation

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.bliss.grid.domain.model.Column
import com.bliss.grid.domain.model.Direction
import com.bliss.grid.domain.model.Grid
import com.bliss.grid.domain.model.Position
import com.bliss.grid.domain.model.Row
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordPlacement
import org.junit.jupiter.api.Test

class LongWordCoverageTest {
    // -- thresholds: per-axis, grid-relative, clamped ------------------------

    @Test
    fun `thresholds scale per axis with F=0-4 for the 28x20 board`() {
        val t = LongWordCoverage.thresholds(width = 28, height = 20, minLen = 2, lUseful = 18)
        // 0.4*28=11.2 -> 11 ; 0.4*20=8.0 -> 8 (coherent with lTargetHorizontal/Vertical 11/8).
        assertThat(t.horizontal).isEqualTo(11)
        assertThat(t.vertical).isEqualTo(8)
    }

    @Test
    fun `thresholds scale per axis for the 22x15 daily board`() {
        val t = LongWordCoverage.thresholds(width = 22, height = 15, minLen = 2, lUseful = 18)
        assertThat(t.horizontal).isEqualTo(9) // 0.4*22=8.8 -> 9
        assertThat(t.vertical).isEqualTo(6) // 0.4*15=6.0 -> 6
    }

    @Test
    fun `thresholds are floored at minLen plus 2 on tiny axes`() {
        val t = LongWordCoverage.thresholds(width = 5, height = 5, minLen = 2, lUseful = 18)
        // 0.4*5=2.0 -> 2, floored to minLen+2 = 4.
        assertThat(t.horizontal).isEqualTo(4)
        assertThat(t.vertical).isEqualTo(4)
    }

    @Test
    fun `thresholds are capped at lUseful`() {
        val t = LongWordCoverage.thresholds(width = 28, height = 20, minLen = 2, lUseful = 7)
        assertThat(t.horizontal).isEqualTo(7)
        assertThat(t.vertical).isEqualTo(7)
    }

    @Test
    fun `thresholds never exceed the axis dimension`() {
        // A horizontal slot can't be longer than the width, so a high fraction must not push Lh past width.
        val t = LongWordCoverage.thresholds(width = 10, height = 30, minLen = 2, fraction = 0.9)
        assertThat(t.horizontal).isEqualTo(9) // 0.9*10=9, within width 10
        assertThat(t.vertical).isEqualTo(27) // 0.9*30=27
    }

    @Test
    fun `a custom fraction shifts both thresholds`() {
        val t = LongWordCoverage.thresholds(width = 28, height = 20, minLen = 2, lUseful = 18, fraction = 0.5)
        assertThat(t.horizontal).isEqualTo(14) // 0.5*28
        assertThat(t.vertical).isEqualTo(10) // 0.5*20
    }

    // -- score: letter-sum over long words, per-axis threshold ---------------

    @Test
    fun `score sums letters in words at or above the per-axis threshold`() {
        val grid = sampleGrid() // H lengths [6,3], V lengths [5,2]
        // lh=5 -> only the len-6 H word ; lv=4 -> only the len-5 V word = 6 + 5.
        assertThat(LongWordCoverage.score(grid, LongThresholds(horizontal = 5, vertical = 4))).isEqualTo(11L)
    }

    @Test
    fun `score applies each axis threshold independently`() {
        val grid = sampleGrid()
        // lh=3 -> both H (6+3=9) ; lv=5 -> only the len-5 V (5) = 14.
        assertThat(LongWordCoverage.score(grid, LongThresholds(horizontal = 3, vertical = 5))).isEqualTo(14L)
    }

    @Test
    fun `a word exactly at the threshold counts`() {
        val grid = sampleGrid()
        // lh=6 counts the len-6 H word ; lv=5 counts the len-5 V word.
        assertThat(LongWordCoverage.score(grid, LongThresholds(horizontal = 6, vertical = 5))).isEqualTo(11L)
    }

    @Test
    fun `score is zero when no word reaches the threshold`() {
        assertThat(LongWordCoverage.score(sampleGrid(), LongThresholds(horizontal = 7, vertical = 7))).isEqualTo(0L)
    }

    @Test
    fun `coverageOf derives per-axis thresholds from the grid dimensions`() {
        val grid = sampleGrid() // 12x8 -> Lh=round(4.8)=5, Lv=round(3.2)=3 floored to 4.
        // Same as LongThresholds(5,4): 6 + 5 = 11.
        assertThat(LongWordCoverage.coverageOf(grid, minLen = 2)).isEqualTo(11L)
    }

    // -- fixtures ------------------------------------------------------------

    /** 12x8 grid: horizontal words of length 6 and 3, vertical words of length 5 and 2, non-overlapping. */
    private fun sampleGrid(): Grid {
        val placements =
            listOf(
                WordPlacement(Word("ABCDEF", "h6"), Position(Row(0), Column(0)), Direction.RIGHT),
                WordPlacement(Word("GHI", "h3"), Position(Row(2), Column(0)), Direction.RIGHT),
                WordPlacement(Word("JKLMN", "v5"), Position(Row(0), Column(10)), Direction.DOWN),
                WordPlacement(Word("OP", "v2"), Position(Row(0), Column(8)), Direction.DOWN),
            )
        return Grid.fromPlacements(width = 12, height = 8, placements = placements)
    }
}
