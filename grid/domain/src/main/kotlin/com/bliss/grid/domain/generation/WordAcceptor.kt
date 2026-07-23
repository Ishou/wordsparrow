package com.bliss.grid.domain.generation

import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordClue
import kotlin.random.Random

/**
 * Bridges the bitmask CSP solver's per-grid mutable state (used words,
 * used lemmas, theme counts) to the immutable [Lexicon].
 *
 * The bitmask domains are keyed only on letter constraints — theme caps
 * and clue cooldown are evaluated lazily at assignment time. A word may
 * survive every letter constraint AND still be rejected here because
 * its only usable clue is on cooldown or its theme would exceed the
 * per-grid cap.
 *
 * Single-use per [BitmaskCsp] search invocation; lives on the stack.
 */
internal class WordAcceptor(
    private val themeLimits: Map<String, Int>,
    private val cooldownPolicy: ClueCooldownPolicy,
    private val surfaceLemmas: SurfaceLemmas = SurfaceLemmas.Inert,
) {
    private val usedWords: HashSet<String> = HashSet()

    // Multiset: a lemma may be contributed by several surfaces (homograph inflections),
    // so a single removal must not unblock it while another placement still holds it.
    private val usedLemmas: HashMap<String, Int> = HashMap()
    private val themeUsed: HashMap<String, Int> = HashMap()

    val themeUsedView: Map<String, Int> get() = themeUsed

    /**
     * True iff this [word] is structurally available for placement:
     *  - its surface form is not already placed;
     *  - its lemma is not already placed;
     *  - at least one of its clues has theme within the live cap AND
     *    is not on cooldown.
     */
    fun accepts(word: Word): Boolean {
        if (word.text in usedWords) return false
        if (lemmasOf(word).any { it in usedLemmas }) return false
        return hasUsableClue(word)
    }

    /**
     * Pick a usable clue for [word] (theme-fitting AND not on cooldown),
     * preferring non-themed clues. Returns null if no usable clue exists
     * (caller skips the word).
     */
    fun pickClue(
        word: Word,
        random: Random,
    ): WordClue? {
        val usable =
            word.clues.filter {
                themeAllowed(it.theme) && !cooldownPolicy.isOnCooldown(ClueId(word.text, it.text))
            }
        if (usable.isEmpty()) return null
        val nonThemed = usable.filter { it.theme == null }
        val pool = if (nonThemed.isNotEmpty()) nonThemed else usable
        return pool.random(random)
    }

    /**
     * Record [word] as placed with [chosenClue]. Caller must invoke
     * [removePlacement] (with the same arguments) on rollback.
     */
    fun recordPlacement(
        word: Word,
        chosenClue: WordClue,
    ) {
        usedWords += word.text
        for (lemma in lemmasOf(word)) {
            usedLemmas[lemma] = (usedLemmas[lemma] ?: 0) + 1
        }
        val theme = chosenClue.theme
        if (theme != null) {
            themeUsed[theme] = (themeUsed[theme] ?: 0) + 1
        }
    }

    /** Invert a previous [recordPlacement]. */
    fun removePlacement(
        word: Word,
        chosenClue: WordClue,
    ) {
        usedWords -= word.text
        for (lemma in lemmasOf(word)) {
            val prev = usedLemmas.getValue(lemma)
            if (prev <= 1) usedLemmas.remove(lemma) else usedLemmas[lemma] = prev - 1
        }
        val theme = chosenClue.theme
        if (theme != null) {
            val prev = themeUsed.getValue(theme)
            if (prev <= 1) themeUsed.remove(theme) else themeUsed[theme] = prev - 1
        }
    }

    // The surface's own lemma plus every other lemma the corpus records for it (dropped by the loader merge).
    private fun lemmasOf(word: Word): Set<String> = surfaceLemmas.lemmasOf(word.text) + word.lemma

    private fun hasUsableClue(word: Word): Boolean =
        word.clues.any {
            themeAllowed(it.theme) && !cooldownPolicy.isOnCooldown(ClueId(word.text, it.text))
        }

    private fun themeAllowed(theme: String?): Boolean {
        if (theme == null) return true
        val cap = themeLimits[theme] ?: return true
        return (themeUsed[theme] ?: 0) < cap
    }
}
