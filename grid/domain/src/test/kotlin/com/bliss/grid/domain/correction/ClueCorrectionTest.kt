package com.bliss.grid.domain.correction

import assertk.assertThat
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import assertk.assertions.isSameInstanceAs
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordClue
import org.junit.jupiter.api.Test

class ClueCorrectionTest {
    private fun word(
        text: String,
        vararg clues: WordClue,
    ): Word = Word(text = text, clues = clues.toList())

    @Test
    fun `replace rewrites the matching clue text and leaves others untouched`() {
        val subject = word("PARIS", WordClue("Capitale de la Fance"), WordClue("Ville lumiere", theme = "geo"))
        val correction =
            ClueCorrection(
                kind = ClueCorrection.Kind.REPLACE,
                oldClueText = "Capitale de la Fance",
                newClueText = "Capitale de la France",
            )

        val result = correction.applyTo(subject)!!

        assertThat(result.clues).hasSize(2)
        assertThat(result.clues[0].text).isEqualTo("Capitale de la France")
        assertThat(result.clues[1].text).isEqualTo("Ville lumiere")
    }

    @Test
    fun `replace preserves the matched clue theme`() {
        val subject = word("EST", WordClue("Point cardinal", theme = "compass"))
        val correction =
            ClueCorrection(
                kind = ClueCorrection.Kind.REPLACE,
                oldClueText = "Point cardinal",
                newClueText = "Direction du soleil levant",
            )

        val result = correction.applyTo(subject)!!

        assertThat(result.clues[0].theme).isEqualTo("compass")
    }

    @Test
    fun `forbid drops the matching clue when others survive`() {
        val subject = word("EST", WordClue("Verbe etre"), WordClue("Point cardinal", theme = "compass"))
        val correction =
            ClueCorrection(kind = ClueCorrection.Kind.FORBID_CLUE, oldClueText = "Verbe etre")

        val result = correction.applyTo(subject)!!

        assertThat(result.clues).hasSize(1)
        assertThat(result.clues[0].text).isEqualTo("Point cardinal")
    }

    @Test
    fun `forbid returns null when it would empty the word`() {
        val subject = word("PARIS", WordClue("Capitale"))
        val correction =
            ClueCorrection(kind = ClueCorrection.Kind.FORBID_CLUE, oldClueText = "Capitale")

        assertThat(correction.applyTo(subject)).isNull()
    }

    @Test
    fun `non-matching clue text leaves the word unchanged`() {
        val subject = word("PARIS", WordClue("Capitale"))
        val correction =
            ClueCorrection(
                kind = ClueCorrection.Kind.REPLACE,
                oldClueText = "Autre chose",
                newClueText = "Nouvelle",
            )

        assertThat(correction.applyTo(subject)).isSameInstanceAs(subject)
    }

    @Test
    fun `wordText narrows the correction to the named word only`() {
        val subject = word("OR", WordClue("Metal precieux"))
        val correction =
            ClueCorrection(
                kind = ClueCorrection.Kind.REPLACE,
                oldClueText = "Metal precieux",
                wordText = "AS",
                newClueText = "Nouvelle",
            )

        assertThat(correction.applyTo(subject)).isSameInstanceAs(subject)
    }

    @Test
    fun `wordText matches case-insensitively against the folded word`() {
        val subject = word("OR", WordClue("Metal precieux"))
        val correction =
            ClueCorrection(
                kind = ClueCorrection.Kind.REPLACE,
                oldClueText = "Metal precieux",
                wordText = "or",
                newClueText = "Metal jaune",
            )

        val result = correction.applyTo(subject)!!
        assertThat(result.clues[0].text).isEqualTo("Metal jaune")
    }
}
