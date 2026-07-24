package com.bliss.grid.application.correction

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test
import java.util.UUID

class SeedCorrectionsUseCaseTest {
    private val actor = UUID.fromString("5eed5eed-0000-0000-0000-000000000000")

    // Fake store: dedups on (folded word, oldClue) across all prior seeds, mirroring the Postgres NOT EXISTS guard.
    private class FakeSeedStore : CorrectionSeedStore {
        val seeded = mutableListOf<SeedReplacement>()
        var lastCreatedBy: UUID? = null

        override fun seedReplacements(
            rows: List<SeedReplacement>,
            createdBy: UUID,
        ): SeedResult {
            lastCreatedBy = createdBy
            var inserted = 0
            for (row in rows) {
                val key = row.wordText.uppercase() to row.oldClueText
                if (seeded.any { (it.wordText.uppercase() to it.oldClueText) == key }) continue
                seeded += row
                inserted++
            }
            return SeedResult(inserted = inserted, skippedExisting = rows.size - inserted)
        }
    }

    @Test
    fun `seeds every valid row and passes the actor through`() {
        val store = FakeSeedStore()
        val rows =
            listOf(
                SeedReplacement("MENACEES", "Faites peur a", "Effrayees"),
                SeedReplacement("CLOS", "Fermer", "Ferme"),
            )

        val summary = SeedCorrectionsUseCase(store).execute(rows, actor)

        assertThat(summary).isEqualTo(SeedCorrectionsUseCase.Summary(submitted = 2, invalid = 0, inserted = 2, skippedExisting = 0))
        assertThat(store.seeded.map { it.wordText }).containsExactlyInAnyOrder("MENACEES", "CLOS")
        assertThat(store.lastCreatedBy).isEqualTo(actor)
    }

    @Test
    fun `drops rows with a blank field or an unchanged clue`() {
        val store = FakeSeedStore()
        val rows =
            listOf(
                SeedReplacement("", "old", "new"),
                SeedReplacement("MOT", "", "new"),
                SeedReplacement("MOT", "old", ""),
                SeedReplacement("MOT", "same", "same"),
                SeedReplacement("GOOD", "old", "new"),
            )

        val summary = SeedCorrectionsUseCase(store).execute(rows, actor)

        assertThat(summary).isEqualTo(SeedCorrectionsUseCase.Summary(submitted = 5, invalid = 4, inserted = 1, skippedExisting = 0))
        assertThat(store.seeded.map { it.wordText }).containsExactlyInAnyOrder("GOOD")
    }

    @Test
    fun `folds a within-batch duplicate (word, oldClue) and counts it skipped`() {
        val store = FakeSeedStore()
        val rows =
            listOf(
                SeedReplacement("mot", "old", "new one"),
                SeedReplacement("MOT", "old", "new two"),
            )

        val summary = SeedCorrectionsUseCase(store).execute(rows, actor)

        assertThat(summary).isEqualTo(SeedCorrectionsUseCase.Summary(submitted = 2, invalid = 0, inserted = 1, skippedExisting = 1))
    }

    @Test
    fun `a re-run over the same source inserts nothing new`() {
        val store = FakeSeedStore()
        val rows = listOf(SeedReplacement("MOT", "old", "new"))
        val useCase = SeedCorrectionsUseCase(store)

        useCase.execute(rows, actor)
        val second = useCase.execute(rows, actor)

        assertThat(second).isEqualTo(SeedCorrectionsUseCase.Summary(submitted = 1, invalid = 0, inserted = 0, skippedExisting = 1))
        assertThat(store.seeded.size).isEqualTo(1)
    }
}
