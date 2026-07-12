package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.bliss.grid.application.correction.ClueOverrideRow
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

class CsvClueOverrideAppenderTest {
    @Test
    fun `writes the header once then appends rows on later flushes`(
        @TempDir dir: Path,
    ) {
        val csv = dir.resolve("clue_overrides_fr.csv")
        val appender = CsvClueOverrideAppender(csv)

        appender.append(listOf(ClueOverrideRow("pain", "Aliment de base", "english-leak")))
        appender.append(listOf(ClueOverrideRow("cane", "Femelle du canard", "english-leak")))

        assertThat(Files.readAllLines(csv)).isEqualTo(
            listOf(
                "word,clue,note",
                "pain,Aliment de base,english-leak",
                "cane,Femelle du canard,english-leak",
            ),
        )
    }

    @Test
    fun `quotes fields carrying a comma or quote`(
        @TempDir dir: Path,
    ) {
        val csv = dir.resolve("clue_overrides_fr.csv")

        CsvClueOverrideAppender(csv).append(listOf(ClueOverrideRow("mot", "Sens un, sens deux", "dit \"ceci\"")))

        assertThat(Files.readAllLines(csv)).isEqualTo(
            listOf(
                "word,clue,note",
                "mot,\"Sens un, sens deux\",\"dit \"\"ceci\"\"\"",
            ),
        )
    }
}
