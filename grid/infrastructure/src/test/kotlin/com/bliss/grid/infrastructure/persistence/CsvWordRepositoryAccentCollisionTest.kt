package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test

class CsvWordRepositoryAccentCollisionTest {
    @Test
    fun `highest-frequency variant keeps its clue as primary when accents fold to the same letters`() {
        // Fixture: pose (freq 8.3M, clue "Place") + pose-grave (freq 97, clue "Placent"), both fold to POSE.
        val repo = CsvWordRepository.fromClasspath("/words/accent-collision-fixture.csv")

        val pose = repo.findByLength(4).single { it.text == "POSE" }

        assertThat(pose.clues.first().text).isEqualTo("Place")
        assertThat(pose.clues.map { it.text }).contains("Placent")
    }
}
