package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import assertk.assertions.prop
import com.bliss.grid.domain.model.Word
import org.junit.jupiter.api.Test

class CsvWordRepositoryFindByTextTest {
    private val repo =
        CsvWordRepository(
            listOf(
                Word("ESSE", "Crochet en forme de S"),
                Word("CHAT", "Felin domestique"),
            ),
        )

    @Test
    fun `finds a word by its exact folded surface`() {
        val hit = repo.findByText("ESSE")!!
        assertThat(hit).prop(Word::text).isEqualTo("ESSE")
        assertThat(hit).prop(Word::definition).isEqualTo("Crochet en forme de S")
    }

    @Test
    fun `returns null for an unknown surface`() {
        assertThat(repo.findByText("INCONNU")).isNull()
    }
}
