package com.bliss.grid.domain.model

data class Word private constructor(
    val text: String,
    /**
     * One or more candidate clues. The list is non-empty by invariant;
     * exactly which clue is shown for a placed word is decided by the
     * grid filler at placement time: it prefers non-themed clues so
     * themed slots stay free for words whose only candidate is themed,
     * then picks uniformly at random among remaining fitting clues.
     * See `SkeletonFiller.pickClue`.
     *
     * Most words have a single clue (LoRA-generated); a few — like
     * `est` — carry both a verb-form clue from the main corpus and a
     * compass-themed alternate from `themed/compass.csv`.
     */
    val clues: List<WordClue>,
    /**
     * Dictionary headword — the canonical (lemmatised) form behind [text].
     * For inflected forms, lemma differs from text (e.g. text="COURUE" lemma="COURIR");
     * for headwords themselves it equals text. Folded to grid-cell ASCII (A–Z, no
     * accents) so two inflected forms of the same lemma share an identical key for
     * dedup purposes during generation. Defaults to [text] when callers don't carry
     * lemma data — equivalent to surface-form-only dedup.
     */
    val lemma: String,
    val separators: List<Int> = emptyList(),
    /** Corpus POS tag (nom/adj/verbe/...), "" when unknown — drives the BitmaskCsp fill priority. */
    val pos: String = "",
) {
    init {
        require(text.isNotEmpty()) { "Word text must not be empty" }
        require(text.all { it in 'A'..'Z' }) { "Word text must be A-Z, was '$text'" }
        require(lemma.isNotEmpty()) { "Word lemma must not be empty (defaults to text)" }
        require(lemma.all { it in 'A'..'Z' }) { "Word lemma must be A-Z, was '$lemma'" }
        require(clues.isNotEmpty()) { "Word must carry at least one WordClue" }
        require(separators.all { it in 1 until text.length }) {
            "Word separators must be in 1..${text.length - 1}, was $separators for '$text'"
        }
        require(separators.zipWithNext().all { (a, b) -> a < b }) {
            "Word separators must be strictly increasing, was $separators"
        }
    }

    /**
     * The "primary" clue text — the first entry in [clues]. Convenience
     * accessor for sites that don't know about the multi-clue feature
     * (rendering at the API layer should prefer the placement's
     * `chosenClue` instead, which respects per-grid theme diversity).
     */
    val definition: String get() = clues.first().text

    companion object {
        operator fun invoke(
            text: String,
            definition: String,
            lemma: String? = null,
            theme: String? = null,
            separators: List<Int> = emptyList(),
            pos: String = "",
        ): Word {
            val foldedText = text.uppercase()
            return Word(
                foldedText,
                listOf(WordClue(definition, theme)),
                lemma?.uppercase() ?: foldedText,
                separators,
                pos,
            )
        }

        operator fun invoke(
            text: String,
            clues: List<WordClue>,
            lemma: String? = null,
            separators: List<Int> = emptyList(),
            pos: String = "",
        ): Word {
            require(clues.isNotEmpty()) { "Word must carry at least one WordClue" }
            val foldedText = text.uppercase()
            return Word(foldedText, clues, lemma?.uppercase() ?: foldedText, separators, pos)
        }

        /** Builds a Word from a raw hyphenated surface, folding hyphens into separators. */
        fun fromSurface(
            text: String,
            definition: String,
            lemma: String? = null,
            theme: String? = null,
        ): Word {
            val (letters, separators) =
                HyphenSurface.split(text.uppercase())
                    ?: throw IllegalArgumentException("Word.fromSurface: not a hyphenated A-Z surface: '$text'")
            val foldedLemma = lemma?.let { HyphenSurface.split(it.uppercase())?.first } ?: letters
            return invoke(letters, definition, foldedLemma, theme, separators)
        }
    }
}
