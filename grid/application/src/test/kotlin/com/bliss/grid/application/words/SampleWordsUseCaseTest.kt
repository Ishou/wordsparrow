package com.bliss.grid.application.words

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.hasSize
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isTrue
import com.bliss.grid.domain.generation.WordRepository
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordClue
import org.junit.jupiter.api.Test
import kotlin.random.Random

private class FixtureWordRepository(
    private val words: List<Word>,
) : WordRepository {
    override fun findByLength(length: Int): List<Word> = words.filter { it.text.length == length }

    override fun findByLengthAndPattern(
        length: Int,
        pattern: Map<Int, Char>,
    ): List<Word> =
        words.filter { word ->
            word.text.length == length && pattern.all { (i, ch) -> word.text[i] == ch }
        }

    override fun containsLemma(text: String): Boolean = words.any { it.lemma == text.trim().uppercase() }
}

class SampleWordsUseCaseTest {
    private val corpus =
        listOf(
            Word(text = "ROI", definition = "souverain"),
            Word(text = "EAU", definition = "liquide vital"),
            Word(text = "ROSE", definition = "fleur a epines"),
            Word(text = "TABLE", definition = "meuble plat"),
            Word(text = "ARBRE", definition = "vegetal a tronc"),
            Word(text = "MAISON", definition = "habitation"),
        )

    private fun useCase(
        words: List<Word> = corpus,
        seed: Long = 42L,
    ) = SampleWordsUseCase(FixtureWordRepository(words), Random(seed))

    @Test
    fun `returns clue-answer pairs from the requested length range`() {
        val result = useCase().invoke(minLen = 3, maxLen = 6, count = 50)

        assertThat(result.map { it.answer }).containsExactlyInAnyOrder(
            "ROI",
            "EAU",
            "ROSE",
            "TABLE",
            "ARBRE",
            "MAISON",
        )
        assertThat(result.all { it.clue.isNotBlank() }).isTrue()
    }

    @Test
    fun `filters out words outside the requested length range`() {
        val result = useCase().invoke(minLen = 3, maxLen = 3, count = 50)

        assertThat(result.map { it.answer }).containsExactlyInAnyOrder("ROI", "EAU")
    }

    @Test
    fun `dedupes inflected forms by lemma keeping one per headword`() {
        val words =
            listOf(
                Word(text = "COURT", definition = "il court", lemma = "COURIR"),
                Word(text = "COURS", definition = "tu cours", lemma = "COURIR"),
                Word(text = "MANGE", definition = "il mange", lemma = "MANGER"),
            )
        val result = useCase(words).invoke(minLen = 3, maxLen = 6, count = 50)

        assertThat(result).hasSize(2)
        assertThat(result.map { it.answer }).containsExactlyInAnyOrder("COURT", "MANGE")
    }

    @Test
    fun `caps the result at count`() {
        val result = useCase().invoke(minLen = 3, maxLen = 6, count = 2)

        assertThat(result).hasSize(2)
    }

    @Test
    fun `clamps count above the ceiling to fifty`() {
        val many =
            (0 until 80).map { i ->
                val token = "AAA" + ('A' + i / 26) + ('A' + i % 26)
                Word(text = token, definition = "def$i", lemma = token)
            }
        val result = useCase(many).invoke(minLen = 3, maxLen = 6, count = 9999)

        assertThat(result).hasSize(50)
    }

    @Test
    fun `clamps non-positive count up to one`() {
        val result = useCase().invoke(minLen = 3, maxLen = 6, count = 0)

        assertThat(result).hasSize(1)
    }

    @Test
    fun `clamps minLen and maxLen into the supported band`() {
        val result = useCase().invoke(minLen = 1, maxLen = 99, count = 50)

        assertThat(result.all { it.answer.length in 3..6 }).isTrue()
        assertThat(result.map { it.answer }).containsExactlyInAnyOrder(
            "ROI",
            "EAU",
            "ROSE",
            "TABLE",
            "ARBRE",
            "MAISON",
        )
    }

    @Test
    fun `returns empty for an empty corpus`() {
        val result = useCase(emptyList()).invoke(minLen = 3, maxLen = 6, count = 50)

        assertThat(result).isEmpty()
    }

    @Test
    fun `is deterministic for a fixed seed`() {
        val first = useCase(seed = 7L).invoke(minLen = 3, maxLen = 6, count = 3)
        val second = useCase(seed = 7L).invoke(minLen = 3, maxLen = 6, count = 3)

        assertThat(first).isEqualTo(second)
    }

    @Test
    fun `picks a clue text that belongs to the sampled word`() {
        val word = Word(text = "ROI", clues = listOf(WordClue("souverain"), WordClue("piece d'echecs")))
        val result = useCase(listOf(word)).invoke(minLen = 3, maxLen = 3, count = 50)

        assertThat(result).hasSize(1)
        assertThat(result.first().clue in setOf("souverain", "piece d'echecs")).isTrue()
    }
}
