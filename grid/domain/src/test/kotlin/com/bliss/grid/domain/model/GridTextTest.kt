package com.bliss.grid.domain.model

import assertk.assertThat
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test

class GridTextTest {
    @Test
    fun `strips diacritics and uppercases`() {
        assertThat(foldToGridText("Été")).isEqualTo("ETE")
        assertThat(foldToGridText("brunâtres")).isEqualTo("BRUNATRES")
    }

    @Test
    fun `expands the French ligatures that do not decompose under NFD`() {
        assertThat(foldToGridText("cœur")).isEqualTo("COEUR")
        assertThat(foldToGridText("et cætera")).isEqualTo("ET CAETERA")
    }

    @Test
    fun `is idempotent on an already-folded surface`() {
        assertThat(foldToGridText("BRUNATRES")).isEqualTo("BRUNATRES")
    }
}
