package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import org.junit.jupiter.api.Test

class CsvWordRepositoryThemeMergeTest {
    @Test
    fun `a surface listed in two theme overlays keeps a themed clue from each`() {
        val repo =
            CsvWordRepository.fromClasspath(
                "/words/theme-merge-main-fixture.csv",
                listOf(
                    "chem" to "/words/theme-merge-chem-fixture.csv",
                    "sigle" to "/words/theme-merge-sigle-fixture.csv",
                ),
            )
        val ag = repo.findByLength(2).single { it.text == "AG" }
        // Both overlays' clues survive (was: the later overlay overwrote the earlier),
        // each carrying its own theme so per-theme caps apply by the chosen clue.
        assertThat(ag.clues.map { it.text }).containsExactlyInAnyOrder("Argent", "Assemblée générale")
        assertThat(ag.clues.map { it.theme }).containsExactlyInAnyOrder("chem", "sigle")
    }
}
