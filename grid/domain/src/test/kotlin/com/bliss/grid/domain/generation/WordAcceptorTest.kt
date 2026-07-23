package com.bliss.grid.domain.generation

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isNull
import assertk.assertions.isTrue
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordClue
import org.junit.jupiter.api.Test
import kotlin.random.Random

class WordAcceptorTest {
    @Test
    fun `accepts returns true on a fresh word with non-themed clue`() {
        val acceptor = WordAcceptor(themeLimits = emptyMap(), cooldownPolicy = ClueCooldownPolicy.Inert)
        val word = Word(text = "MOTS", clues = listOf(WordClue("Paroles")))
        assertThat(acceptor.accepts(word)).isTrue()
    }

    @Test
    fun `accepts returns false on already-placed surface form`() {
        val acceptor = WordAcceptor(themeLimits = emptyMap(), cooldownPolicy = ClueCooldownPolicy.Inert)
        val word = Word(text = "MOTS", clues = listOf(WordClue("Paroles")))
        val clue = acceptor.pickClue(word, Random(0))!!
        acceptor.recordPlacement(word, clue)
        assertThat(acceptor.accepts(word)).isFalse()
    }

    @Test
    fun `accepts returns false on already-placed lemma`() {
        val acceptor = WordAcceptor(themeLimits = emptyMap(), cooldownPolicy = ClueCooldownPolicy.Inert)
        val ours = Word(text = "COURT", lemma = "COURIR", clues = listOf(WordClue("c1")))
        val courait = Word(text = "COURAIT", lemma = "COURIR", clues = listOf(WordClue("c2")))
        val clue = acceptor.pickClue(ours, Random(0))!!
        acceptor.recordPlacement(ours, clue)
        assertThat(acceptor.accepts(courait)).isFalse()
    }

    @Test
    fun `theme cap blocks further placements once met`() {
        val themedClue = WordClue("Direction", theme = "compass")
        val w1 = Word(text = "EST", clues = listOf(themedClue))
        val w2 = Word(text = "OUEST", clues = listOf(themedClue))
        val acceptor = WordAcceptor(themeLimits = mapOf("compass" to 1), cooldownPolicy = ClueCooldownPolicy.Inert)
        val clue = acceptor.pickClue(w1, Random(0))!!
        acceptor.recordPlacement(w1, clue)
        // w2's only clue is themed compass; cap is 1 and already used.
        assertThat(acceptor.accepts(w2)).isFalse()
    }

    @Test
    fun `pickClue returns null when no clue is usable due to cooldown`() {
        val word = Word(text = "EST", clues = listOf(WordClue("verb"), WordClue("compass", theme = "compass")))
        val policy = ClueCooldownPolicy.fromSet(setOf(ClueId("EST", "verb"), ClueId("EST", "compass")))
        val acceptor = WordAcceptor(themeLimits = emptyMap(), cooldownPolicy = policy)
        assertThat(acceptor.pickClue(word, Random(0))).isNull()
    }

    @Test
    fun `pickClue prefers non-themed clue`() {
        val word =
            Word(
                text = "EST",
                clues = listOf(WordClue("compass", theme = "compass"), WordClue("verb")),
            )
        val acceptor = WordAcceptor(themeLimits = emptyMap(), cooldownPolicy = ClueCooldownPolicy.Inert)
        repeat(20) {
            val clue = acceptor.pickClue(word, Random(it.toLong()))!!
            assertThat(clue.text).isEqualTo("verb") // always the non-themed one
        }
    }

    @Test
    fun `removePlacement undoes recordPlacement`() {
        val word = Word(text = "MOTS", clues = listOf(WordClue("Paroles")))
        val acceptor = WordAcceptor(themeLimits = emptyMap(), cooldownPolicy = ClueCooldownPolicy.Inert)
        val clue = acceptor.pickClue(word, Random(0))!!
        acceptor.recordPlacement(word, clue)
        assertThat(acceptor.accepts(word)).isFalse()
        acceptor.removePlacement(word, clue)
        assertThat(acceptor.accepts(word)).isTrue()
    }

    @Test
    fun `placing a surface blocks a different surface that shares a secondary lemma`() {
        // LIE carries lemmas {LIE (noun), LIER (verb)}; LIA carries {LIER}. The loader's
        // single-lemma merge keeps only LIE for the surface LIE, so without SurfaceLemmas
        // the shared LIER is invisible and both forms slip onto one grid (the reported bug).
        val surfaceLemmas =
            SurfaceLemmas.fromMap(
                mapOf(
                    "LIE" to setOf("LIE", "LIER"),
                    "LIA" to setOf("LIER"),
                ),
            )
        val acceptor = WordAcceptor(themeLimits = emptyMap(), cooldownPolicy = ClueCooldownPolicy.Inert, surfaceLemmas = surfaceLemmas)
        val lie = Word(text = "LIE", lemma = "LIE", clues = listOf(WordClue("Dépôt au fond du vin")))
        val lia = Word(text = "LIA", lemma = "LIER", clues = listOf(WordClue("Attacha jadis")))
        acceptor.recordPlacement(lie, acceptor.pickClue(lie, Random(0))!!)
        assertThat(acceptor.accepts(lia)).isFalse()
    }

    @Test
    fun `secondary-lemma block clears once the placement is removed`() {
        val surfaceLemmas =
            SurfaceLemmas.fromMap(
                mapOf(
                    "ES" to setOf("ES", "ETRE"),
                    "ETE" to setOf("ETE", "ETRE"),
                ),
            )
        val acceptor = WordAcceptor(themeLimits = emptyMap(), cooldownPolicy = ClueCooldownPolicy.Inert, surfaceLemmas = surfaceLemmas)
        val es = Word(text = "ES", lemma = "ETRE", clues = listOf(WordClue("Existes")))
        val ete = Word(text = "ETE", lemma = "ETE", clues = listOf(WordClue("Saison chaude")))
        val clue = acceptor.pickClue(es, Random(0))!!
        acceptor.recordPlacement(es, clue)
        assertThat(acceptor.accepts(ete)).isFalse()
        acceptor.removePlacement(es, clue)
        assertThat(acceptor.accepts(ete)).isTrue()
    }

    @Test
    fun `two placements sharing a lemma both must be removed before it unblocks`() {
        // Multiset rollback: A and B both contribute LIER; removing one keeps LIER blocked.
        val surfaceLemmas =
            SurfaceLemmas.fromMap(
                mapOf(
                    "LIA" to setOf("LIER"),
                    "LIE" to setOf("LIER"),
                    "LIER" to setOf("LIER"),
                ),
            )
        val acceptor = WordAcceptor(themeLimits = emptyMap(), cooldownPolicy = ClueCooldownPolicy.Inert, surfaceLemmas = surfaceLemmas)
        val a = Word(text = "LIA", lemma = "LIER", clues = listOf(WordClue("Attacha jadis")))
        val b = Word(text = "LIE", lemma = "LIER", clues = listOf(WordClue("Noue")))
        val probe = Word(text = "LIER", lemma = "LIER", clues = listOf(WordClue("Attacher")))
        val clueA = acceptor.pickClue(a, Random(0))!!
        val clueB = acceptor.pickClue(b, Random(0))!!
        acceptor.recordPlacement(a, clueA)
        acceptor.recordPlacement(b, clueB)
        assertThat(acceptor.accepts(probe)).isFalse()
        acceptor.removePlacement(a, clueA)
        assertThat(acceptor.accepts(probe)).isFalse()
        acceptor.removePlacement(b, clueB)
        assertThat(acceptor.accepts(probe)).isTrue()
    }

    @Test
    fun `inert surfaceLemmas reproduces single-lemma dedup`() {
        // Default (empty) seam: only the surface's own Word.lemma dedups, so LIA and LIE
        // with distinct lemmas both place — the legacy behavior, unchanged.
        val acceptor = WordAcceptor(themeLimits = emptyMap(), cooldownPolicy = ClueCooldownPolicy.Inert)
        val lie = Word(text = "LIE", lemma = "LIE", clues = listOf(WordClue("Dépôt au fond du vin")))
        val lia = Word(text = "LIA", lemma = "LIER", clues = listOf(WordClue("Attacha jadis")))
        acceptor.recordPlacement(lie, acceptor.pickClue(lie, Random(0))!!)
        assertThat(acceptor.accepts(lia)).isTrue()
    }

    @Test
    fun `themeUsedView reflects theme placements`() {
        val themedClue = WordClue("Direction", theme = "compass")
        val word = Word(text = "EST", clues = listOf(themedClue))
        val acceptor = WordAcceptor(themeLimits = mapOf("compass" to 5), cooldownPolicy = ClueCooldownPolicy.Inert)
        acceptor.recordPlacement(word, acceptor.pickClue(word, Random(0))!!)
        assertThat(acceptor.themeUsedView["compass"]).isEqualTo(1)
    }
}
