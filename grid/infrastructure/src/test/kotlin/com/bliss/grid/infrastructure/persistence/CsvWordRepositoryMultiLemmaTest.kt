package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.isEmpty
import org.junit.jupiter.api.Test

class CsvWordRepositoryMultiLemmaTest {
    @Test
    fun `surfaceLemmas recovers both lemmas of a folded surface the merge collapses`() {
        // Fixture: LIE ships as (nom, lemma=lie) + (verbe, lemma=lier); the byText merge
        // keeps one Word and drops the other's lemma. SurfaceLemmas must carry both so the
        // generator dedups LIE against LIA (also lemma=lier). See ADR-0100.
        val repo = CsvWordRepository.fromClasspath("/words/multi-lemma-fixture.csv")

        assertThat(repo.surfaceLemmas().lemmasOf("LIE")).containsExactlyInAnyOrder("LIE", "LIER")
        // LIA carries a single lemma; the seam tracks only multi-lemma surfaces because a
        // single-lemma surface is already deduped by its own Word.lemma.
        assertThat(repo.surfaceLemmas().lemmasOf("LIA")).isEmpty()
    }
}
