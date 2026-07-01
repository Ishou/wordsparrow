package com.bliss.grid.domain.generation

import assertk.assertThat
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import org.junit.jupiter.api.Test

class BlackCellLayoutConnectivityTest {
    @Test
    fun `all-white grid is one connected region`() {
        assertThat(BlackCellLayout.disconnectsWhite(CellArray(3, 3))).isFalse()
    }

    @Test
    fun `a single interior black does not disconnect the white region`() {
        val cells = CellArray(3, 3)
        cells.set(1, 1, CellArray.BLACK)
        assertThat(BlackCellLayout.disconnectsWhite(cells)).isFalse()
    }

    @Test
    fun `a white cell walled off by black and the border is a closed block`() {
        val cells = CellArray(3, 3)
        cells.set(0, 1, CellArray.BLACK) // right of (0,0)
        cells.set(1, 0, CellArray.BLACK) // below (0,0)
        // (0,0) is now sealed off from the rest of the white cells.
        assertThat(BlackCellLayout.disconnectsWhite(cells)).isTrue()
    }

    @Test
    fun `a 2x2 white pocket sealed from the rest is a closed block`() {
        val cells = CellArray(5, 5)
        // Wall off the top-left 2x2 (rows 0-1, cols 0-1) with a black L.
        cells.set(0, 2, CellArray.BLACK)
        cells.set(1, 2, CellArray.BLACK)
        cells.set(2, 0, CellArray.BLACK)
        cells.set(2, 1, CellArray.BLACK)
        assertThat(BlackCellLayout.disconnectsWhite(cells)).isTrue()
    }
}
