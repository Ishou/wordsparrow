package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.containsExactly
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import com.bliss.grid.application.correction.SeedReplacement
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

class CsvCorrectionSeedSourceTest {
    @Test
    fun `reads rows and keeps clue text with embedded commas verbatim`(
        @TempDir dir: Path,
    ) {
        val csv = dir.resolve("seed.csv")
        Files.writeString(
            csv,
            """
            word,old_clue,new_clue
            MENACEES,"Faites peur a, jadis",Effrayees
            CLOS, Fermer ,Ferme
            """.trimIndent(),
        )

        val rows = CsvCorrectionSeedSource(csv).read()

        assertThat(rows).hasSize(2)
        assertThat(rows[0]).isEqualTo(SeedReplacement("MENACEES", "Faites peur a, jadis", "Effrayees"))
        // Word is trimmed; clue text is preserved exactly (leading space kept) so it text-joins against the grid.
        assertThat(rows[1]).isEqualTo(SeedReplacement("CLOS", " Fermer ", "Ferme"))
    }

    @Test
    fun `tolerates column order and extra columns`(
        @TempDir dir: Path,
    ) {
        val csv = dir.resolve("seed.csv")
        Files.writeString(
            csv,
            """
            new_clue,note,word,old_clue
            Ferme,ppas,CLOS,Fermer
            """.trimIndent(),
        )

        val rows = CsvCorrectionSeedSource(csv).read()

        assertThat(rows.map { it.wordText }).containsExactly("CLOS")
        assertThat(rows[0].newClueText).isEqualTo("Ferme")
    }

    @Test
    fun `rejects a source missing a required column`(
        @TempDir dir: Path,
    ) {
        val csv = dir.resolve("seed.csv")
        Files.writeString(csv, "word,new_clue\nCLOS,Ferme")

        val error = assertThrows<IllegalArgumentException> { CsvCorrectionSeedSource(csv).read() }
        assertThat(error.message!!).contains("old_clue")
    }
}
