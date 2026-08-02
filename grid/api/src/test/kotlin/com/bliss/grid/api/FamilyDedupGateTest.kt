package com.bliss.grid.api

import assertk.assertThat
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isGreaterThan
import com.bliss.grid.domain.generation.GridConstraints
import com.bliss.grid.domain.generation.GridGenerator
import com.bliss.grid.infrastructure.persistence.CsvWordRepository
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.nio.file.Path
import kotlin.random.Random

/**
 * Generation-level gate for the morphological family-dedup invariant: no generated
 * grid may place two words the family edges consider the same family — grammalecte
 * participles (ÉMANÉE + ÉMANER) and Démonette simple derivations (SAUT + SAUTEE).
 * The oracle (the folded family-edge CSV resources under `morphology/`) is INDEPENDENT
 * of the generator's own dedup key, so it catches the violation regardless of which
 * layer the key breaks in. Opt-in against the real corpus via
 * `WORDSPARROW_REAL_CORPUS_DIR` (the private clue-data corpus); skipped otherwise.
 */
@Tag("bench")
class FamilyDedupGateTest {
    /** Union-find over folded lemmas; unlisted lemmas are their own singleton family. */
    private class FamilyOracle(
        edges: List<Pair<String, String>>,
    ) {
        private val parent = HashMap<String, String>()

        private fun find(x: String): String {
            var r = x
            while (true) {
                val p = parent[r] ?: return r
                if (p == r) return r
                r = p
            }
        }

        init {
            edges.forEach { (a, b) -> parent[find(a)] = find(b) }
        }

        fun familyOf(lemma: String): String = find(lemma)
    }

    private fun oracleEdges(): List<Pair<String, String>> =
        listOf("/morphology/participle_family_edges.csv", "/morphology/derivational_family_edges.csv")
            .flatMap { path ->
                javaClass.getResourceAsStream(path)!!.bufferedReader().useLines { lines ->
                    lines
                        .drop(1)
                        .mapNotNull { line -> line.split(",").takeIf { it.size == 2 }?.let { it[0] to it[1] } }
                        .toList()
                }
            }

    private fun oracle(): FamilyOracle = FamilyOracle(oracleEdges())

    private companion object {
        const val MAX_WORD_LENGTH = 30
    }

    /**
     * Deterministic gate: the generator's OWN dedup key (`surfaceLemmas` +
     * `Word.lemma`, exactly what `WordAcceptor` consumes) must bridge every
     * family edge whose endpoints are both in the corpus. Necessary and
     * sufficient for "no generated grid places a family pair", and unlike the
     * fleet gate below it can't false-pass on generation luck (the manifestation
     * is rare per grid). This is the primary guard for both edge sources.
     */
    @Test
    fun `the generator dedup key bridges every morphological family in the corpus`() {
        val corpusDir = System.getenv("WORDSPARROW_REAL_CORPUS_DIR")
        assumeTrue(corpusDir != null) { "set WORDSPARROW_REAL_CORPUS_DIR to the clue-data corpus directory" }
        val repo = CsvWordRepository.frenchFromDir(Path.of(corpusDir))
        val surfaceLemmas = repo.surfaceLemmas()
        val words = (2..MAX_WORD_LENGTH).flatMap { repo.findByLength(it) }
        val corpusLemmas = words.mapTo(HashSet()) { it.lemma }
        val relatedFor = HashMap<String, MutableSet<String>>()
        oracleEdges().forEach { (a, b) -> relatedFor.getOrPut(a) { HashSet() } += b }

        val severed = mutableListOf<String>()
        for (word in words) {
            // A family member absent from the corpus can never be placed, so no bridge is required for it.
            val related = relatedFor[word.lemma]?.filter { it in corpusLemmas }.orEmpty()
            if (related.isEmpty()) continue
            val key = surfaceLemmas.lemmasOf(word.text) + word.lemma
            val missing = related - key
            if (missing.isNotEmpty()) severed += "${word.text}(${word.lemma})->${missing.joinToString()}"
        }
        System.err.println("[family-key] severed surfaces=${severed.size}; sample=${severed.take(8)}")
        assertThat(severed.size).isEqualTo(0)
    }

    @Test
    fun `distilled generation never places two words of the same morphological family`() {
        val corpusDir = System.getenv("WORDSPARROW_REAL_CORPUS_DIR")
        assumeTrue(corpusDir != null) { "set WORDSPARROW_REAL_CORPUS_DIR to the clue-data corpus directory" }
        val repo = CsvWordRepository.frenchFromDir(Path.of(corpusDir))
        val family = oracle()
        val generator = GridGenerator(repo)
        val gridCount = System.getenv("FAMILY_GATE_GRIDS")?.toIntOrNull() ?: 20

        val violations = mutableListOf<String>()
        var generated = 0
        var totalPlacements = 0
        repeat(gridCount) { i ->
            val grid =
                generator
                    .generateDistilled(
                        GridConstraints(width = 15, height = 12),
                        random = Random((i + 1).toLong()),
                        timeoutMs = 30_000,
                        bestOfN = 1,
                    )?.grid ?: return@repeat
            generated++
            totalPlacements += grid.placements.size
            grid.placements
                .groupBy { family.familyOf(it.word.lemma) }
                .filterValues { it.size > 1 }
                .forEach { (_, placements) ->
                    violations += "grid #$i: " + placements.joinToString(" + ") { "${it.word.text}(${it.word.lemma})" }
                }
        }
        System.err.println("[family-gate] generated=$generated/$gridCount placements=$totalPlacements violations=${violations.size}")
        // Guard against a false pass: an empty violation list means nothing only if grids were actually generated + checked.
        assertThat(generated).isGreaterThan(gridCount / 2)
        assertThat(violations).isEmpty()
    }
}
