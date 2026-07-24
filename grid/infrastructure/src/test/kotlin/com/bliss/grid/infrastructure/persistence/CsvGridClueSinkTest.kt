package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.bliss.grid.application.correction.GridClueUsage
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

class CsvGridClueSinkTest {
    @Test
    fun `writes a header and quotes clue text carrying a comma`(
        @TempDir dir: Path,
    ) {
        val out = dir.resolve("enum.csv")

        CsvGridClueSink(out).write(
            listOf(
                GridClueUsage("MENACEES", "Faites peur a, jadis"),
                GridClueUsage("CLOS", "Fermer"),
            ),
        )

        assertThat(Files.readString(out))
            .isEqualTo("word,old_clue\nMENACEES,\"Faites peur a, jadis\"\nCLOS,Fermer\n")
    }

    @Test
    fun `overwrites an existing file rather than appending`(
        @TempDir dir: Path,
    ) {
        val out = dir.resolve("enum.csv")
        Files.writeString(out, "stale\nstale\nstale\n")

        CsvGridClueSink(out).write(listOf(GridClueUsage("CLOS", "Fermer")))

        assertThat(Files.readString(out)).isEqualTo("word,old_clue\nCLOS,Fermer\n")
    }
}
