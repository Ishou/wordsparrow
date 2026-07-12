package com.bliss.grid.domain.correction

import com.bliss.grid.domain.model.Word

/** A maintainer correction to a corpus clue, keyed on [oldClueText] and optionally narrowed by [wordText] (ADR-0108). */
data class ClueCorrection(
    val kind: Kind,
    val oldClueText: String,
    val wordText: String? = null,
    val newClueText: String? = null,
) {
    // Folded to the grid-cell uppercase form so it compares against Word.text.
    private val foldedWordText: String? = wordText?.uppercase()

    enum class Kind(
        val wire: String,
    ) {
        REPLACE("replace"),
        FORBID_CLUE("forbid_clue"),
        ;

        companion object {
            fun fromWire(wire: String): Kind? = entries.firstOrNull { it.wire == wire }
        }
    }

    /** Corrects [word], returns it unchanged when untargeted, or null when a forbid empties its clue list (ADR-0108). */
    fun applyTo(word: Word): Word? {
        if (foldedWordText != null && foldedWordText != word.text) return word
        if (word.clues.none { it.text == oldClueText }) return word
        return when (kind) {
            Kind.REPLACE -> {
                val replacement = newClueText ?: return word
                val rewritten =
                    word.clues.map { clue ->
                        if (clue.text == oldClueText) clue.copy(text = replacement) else clue
                    }
                Word(text = word.text, clues = rewritten, lemma = word.lemma, separators = word.separators)
            }
            Kind.FORBID_CLUE -> {
                val remaining = word.clues.filterNot { it.text == oldClueText }
                if (remaining.isEmpty()) {
                    null
                } else {
                    Word(text = word.text, clues = remaining, lemma = word.lemma, separators = word.separators)
                }
            }
        }
    }
}
