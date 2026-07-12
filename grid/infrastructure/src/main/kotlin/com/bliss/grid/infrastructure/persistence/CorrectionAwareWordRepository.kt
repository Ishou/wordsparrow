package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.domain.correction.ClueCorrection
import com.bliss.grid.domain.generation.WordRepository
import com.bliss.grid.domain.model.Word

/** Overlays active corrections onto a delegate corpus at generation time, read per call (ADR-0108). */
class CorrectionAwareWordRepository(
    private val delegate: WordRepository,
    private val corrections: () -> List<ClueCorrection>,
) : WordRepository {
    override fun findByLength(length: Int): List<Word> = applyAll(delegate.findByLength(length))

    override fun findByLengthAndPattern(
        length: Int,
        pattern: Map<Int, Char>,
    ): List<Word> = applyAll(delegate.findByLengthAndPattern(length, pattern))

    override fun countByLength(length: Int): Int =
        if (corrections().isEmpty()) delegate.countByLength(length) else findByLength(length).size

    override fun lettersAtPosition(
        length: Int,
        position: Int,
    ): Set<Char> {
        if (corrections().isEmpty()) return delegate.lettersAtPosition(length, position)
        val out = HashSet<Char>(26)
        for (word in findByLength(length)) {
            if (position in 0 until word.text.length) out += word.text[position]
        }
        return out
    }

    // Corrections only rewrite or drop a clue; lemma membership is unchanged (a word-scoped last-clue forbid is rejected at record time).
    override fun containsLemma(text: String): Boolean = delegate.containsLemma(text)

    private fun applyAll(words: List<Word>): List<Word> {
        val active = corrections()
        if (active.isEmpty()) return words
        // foldRight applies the newest correction (last, by created_at) first so it supersedes older ones (ADR-0108).
        return words.mapNotNull { word ->
            active.foldRight(word as Word?) { correction, current -> current?.let { correction.applyTo(it) } }
        }
    }
}
