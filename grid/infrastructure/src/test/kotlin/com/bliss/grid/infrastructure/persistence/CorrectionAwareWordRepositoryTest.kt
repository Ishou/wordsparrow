package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import com.bliss.grid.domain.correction.ClueCorrection
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordClue
import org.junit.jupiter.api.Test

class CorrectionAwareWordRepositoryTest {
    private val paris = Word("PARIS", listOf(WordClue("Capitale de la Fance")))
    private val est = Word("EST", listOf(WordClue("Verbe etre"), WordClue("Point cardinal", theme = "compass")))
    private val delegate = InMemoryWordRepository(listOf(paris, est))

    @Test
    fun `replace rewrites the matching clue text in findByLength results`() {
        val overlay =
            CorrectionAwareWordRepository(delegate) {
                listOf(
                    ClueCorrection(
                        ClueCorrection.Kind.REPLACE,
                        oldClueText = "Capitale de la Fance",
                        newClueText = "Capitale de la France",
                    ),
                )
            }

        val result = overlay.findByLength(5).single { it.text == "PARIS" }

        assertThat(result.clues[0].text).isEqualTo("Capitale de la France")
    }

    @Test
    fun `replace also reaches findByLengthAndPattern results`() {
        val overlay =
            CorrectionAwareWordRepository(delegate) {
                listOf(ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "Capitale de la Fance", newClueText = "Corrigee"))
            }

        val result = overlay.findByLengthAndPattern(5, mapOf(0 to 'P')).single()

        assertThat(result.clues[0].text).isEqualTo("Corrigee")
    }

    @Test
    fun `forbid that empties a word removes it from the result set`() {
        val overlay =
            CorrectionAwareWordRepository(delegate) {
                listOf(ClueCorrection(ClueCorrection.Kind.FORBID_CLUE, oldClueText = "Capitale de la Fance"))
            }

        assertThat(overlay.findByLength(5).map { it.text }).containsExactlyInAnyOrder()
        assertThat(overlay.countByLength(5)).isEqualTo(0)
    }

    @Test
    fun `forbid that leaves a surviving clue keeps the word with the remaining clue`() {
        val overlay =
            CorrectionAwareWordRepository(delegate) {
                listOf(ClueCorrection(ClueCorrection.Kind.FORBID_CLUE, oldClueText = "Verbe etre"))
            }

        val result = overlay.findByLength(3).single()
        assertThat(result.text).isEqualTo("EST")
        assertThat(result.clues.map { it.text }).containsExactlyInAnyOrder("Point cardinal")
    }

    @Test
    fun `no active corrections passes the delegate results through unchanged`() {
        val overlay = CorrectionAwareWordRepository(delegate) { emptyList() }

        assertThat(overlay.findByLength(5).single()).isEqualTo(paris)
        assertThat(overlay.countByLength(3)).isEqualTo(1)
        assertThat(overlay.lettersAtPosition(5, 0)).containsExactlyInAnyOrder('P')
    }

    @Test
    fun `lettersAtPosition reflects a forbid-dropped word`() {
        val overlay =
            CorrectionAwareWordRepository(delegate) {
                listOf(ClueCorrection(ClueCorrection.Kind.FORBID_CLUE, oldClueText = "Capitale de la Fance"))
            }

        assertThat(overlay.lettersAtPosition(5, 0).contains('P')).isFalse()
    }

    @Test
    fun `containsLemma still resolves a corrected word`() {
        val overlay =
            CorrectionAwareWordRepository(delegate) {
                listOf(ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "Verbe etre", newClueText = "X"))
            }

        assertThat(overlay.containsLemma("EST")).isTrue()
    }
}
