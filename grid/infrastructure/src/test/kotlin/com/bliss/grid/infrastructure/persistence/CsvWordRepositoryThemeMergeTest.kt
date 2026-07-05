package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.containsExactly
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
        // Both overlays' clues survive (was: later overlay clobbered the earlier).
        assertThat(ag.clues.map { it.text }).containsExactlyInAnyOrder("Argent", "Assemblée générale")
        assertThat(ag.clues.map { it.theme }).containsExactlyInAnyOrder("chem", "sigle")
    }

    @Test
    fun `a hyphenated compound word present in both main corpus and a theme overlay keeps its separators`() {
        val repo =
            CsvWordRepository.fromClasspath(
                "/words/theme-merge-hyphen-main-fixture.csv",
                listOf("meteo" to "/words/theme-merge-hyphen-overlay-fixture.csv"),
            )
        val word = repo.findByLength(9).single { it.text == "ARCENCIEL" }
        // Regression guard: the overlay-merge path used to reconstruct Word without separators.
        assertThat(word.separators).containsExactly(3, 5)
        assertThat(word.clues.map { it.text }).containsExactlyInAnyOrder("Phénomène optique", "Météo")
    }

    @Test
    fun `a hyphenated compound word present only in a theme overlay keeps its separators`() {
        val repo =
            CsvWordRepository.fromClasspath(
                "/words/theme-merge-main-fixture.csv",
                listOf("meteo" to "/words/theme-merge-hyphen-overlay-fixture.csv"),
            )
        val word = repo.findByLength(9).single { it.text == "ARCENCIEL" }
        // Regression guard: theme-stamping used to reconstruct Word without separators.
        assertThat(word.separators).containsExactly(3, 5)
    }
}
