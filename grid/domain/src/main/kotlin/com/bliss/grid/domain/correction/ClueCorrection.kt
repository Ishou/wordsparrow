package com.bliss.grid.domain.correction

import com.bliss.grid.domain.model.Word

/** A maintainer correction to a corpus clue (or a blocklisted word), narrowed by [wordText]; [oldClueText] is null for a blocklist (ADR-0108, ADR-0110). */
data class ClueCorrection(
    val kind: Kind,
    val oldClueText: String? = null,
    val wordText: String? = null,
    val newClueText: String? = null,
    val reason: String? = null,
) {
    // Folded to the grid-cell uppercase form so it compares against Word.text.
    private val foldedWordText: String? = wordText?.uppercase()

    enum class Kind(
        val wire: String,
    ) {
        REPLACE("replace"),
        FORBID_CLUE("forbid_clue"),
        BLOCKLIST_WORD("blocklist_word"),
        ;

        companion object {
            fun fromWire(wire: String): Kind? = entries.firstOrNull { it.wire == wire }
        }
    }

    /** Corrects [word]: unchanged when untargeted, or null when a forbid empties its clues or a blocklist drops the word (ADR-0108, ADR-0110). */
    fun applyTo(word: Word): Word? {
        if (foldedWordText != null && foldedWordText != word.text) return word
        // A blocklist drops the named word unconditionally, ignoring clues (ADR-0110); a null wordText targets nothing.
        if (kind == Kind.BLOCKLIST_WORD) return if (foldedWordText == null) word else null
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
            Kind.BLOCKLIST_WORD -> null
        }
    }
}
