package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test

class CsvWordRepositoryCompoundTest {
    private val repo = CsvWordRepository.fromClasspath("/words/compound-fixture.csv")

    @Test
    fun `hyphenated word loads as an A-Z run with separator offsets`() {
        val w = repo.findByLength(9).single { it.text == "ARCENCIEL" }
        assertThat(w.separators).isEqualTo(listOf(3, 5))
    }

    @Test
    fun `plain word loads with no separators`() {
        val w = repo.findByLength(4).single { it.text == "CHAT" }
        assertThat(w.separators).isEmpty()
    }

    @Test
    fun `apostrophe entry is dropped, not loaded`() {
        assertThat(repo.findByLength(10).filter { it.text.startsWith("CEST") }).isEmpty()
    }
}
