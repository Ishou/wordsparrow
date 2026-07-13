package com.bliss.grid.application.correction

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import com.bliss.grid.domain.generation.WordRepository
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordClue
import org.junit.jupiter.api.Test

class ListWordCluesUseCaseTest {
    private val esse =
        Word(
            "ESSE",
            listOf(
                WordClue("Crochet en forme de S"),
                WordClue("Lettre de l'alphabet", theme = "typographie"),
            ),
        )

    private val corpus =
        object : WordRepository {
            private val words = listOf(esse)

            override fun findByLength(length: Int): List<Word> = words.filter { it.text.length == length }

            override fun findByLengthAndPattern(
                length: Int,
                pattern: Map<Int, Char>,
            ): List<Word> = findByLength(length).filter { w -> pattern.all { (i, ch) -> w.text[i] == ch } }

            override fun containsLemma(text: String): Boolean = words.any { it.text == text.uppercase() }
        }

    private val useCase = ListWordCluesUseCase(corpus)

    @Test
    fun `returns every clue including themed ones in corpus order`() {
        assertThat(useCase.execute("ESSE")).isNotNull().containsExactly(
            WordClue("Crochet en forme de S"),
            WordClue("Lettre de l'alphabet", theme = "typographie"),
        )
    }

    @Test
    fun `returns null when the word is not in the corpus`() {
        assertThat(useCase.execute("INCONNU")).isNull()
    }
}
