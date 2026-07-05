package com.bliss.grid.domain.model

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import io.kotest.property.Arb
import io.kotest.property.arbitrary.stringPattern
import io.kotest.property.checkAll
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test

class HyphenSurfaceTest {
    @Test
    fun `plain word has no separators`() {
        assertThat(HyphenSurface.split("CHAT")).isEqualTo("CHAT" to emptyList<Int>())
    }

    @Test
    fun `single hyphen yields one offset at the following cell`() {
        assertThat(HyphenSurface.split("PEUT-ETRE")).isEqualTo("PEUTETRE" to listOf(4))
    }

    @Test
    fun `multiple hyphens yield increasing offsets`() {
        assertThat(HyphenSurface.split("ARC-EN-CIEL")).isEqualTo("ARCENCIEL" to listOf(3, 5))
    }

    @Test
    fun `empty string is rejected`() {
        assertThat(HyphenSurface.split("")).isNull()
    }

    @Test
    fun `single-letter halves at the A-Z upper boundary split correctly`() {
        assertThat(HyphenSurface.split("Z-Z")).isEqualTo("ZZ" to listOf(1))
    }

    @Test
    fun `leading hyphen is rejected`() {
        assertThat(HyphenSurface.split("-ABC")).isNull()
    }

    @Test
    fun `trailing hyphen is rejected`() {
        assertThat(HyphenSurface.split("ABC-")).isNull()
    }

    @Test
    fun `doubled hyphen is rejected`() {
        assertThat(HyphenSurface.split("A--B")).isNull()
    }

    @Test
    fun `non-letter non-hyphen char is rejected`() {
        assertThat(HyphenSurface.split("A B")).isNull()
        assertThat(HyphenSurface.split("L'EAU")).isNull()
        assertThat(HyphenSurface.split("CH1T")).isNull()
    }

    @Test
    fun `round-trip - reinserting hyphens at offsets rebuilds the surface`() {
        runBlocking {
            checkAll(Arb.stringPattern("[A-Z]-?[A-Z]([A-Z]|-[A-Z]){0,8}")) { raw ->
                val result = HyphenSurface.split(raw)
                if (result != null) {
                    val (letters, seps) = result
                    val rebuilt =
                        buildString {
                            letters.forEachIndexed { i, ch ->
                                if (i in seps) append('-')
                                append(ch)
                            }
                        }
                    assertThat(rebuilt).isEqualTo(raw)
                }
            }
        }
    }
}
