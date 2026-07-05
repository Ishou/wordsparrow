package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isNotEmpty
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

/** ADR-0097: the corpus loads from a directory volume (populated from object storage), not just the classpath. */
class CsvWordRepositoryFromDirTest {
    @Test
    fun `loads the corpus from a directory volume mirroring the classpath layout`(
        @TempDir tmp: Path,
    ) {
        val words = Files.createDirectories(tmp.resolve("words"))
        Files.writeString(
            words.resolve("words-fr.csv"),
            "word,language,length,frequency,difficulty,clue,source,source_license,lemma\n" +
                "chat,fr,4,1000,0.3,Félin domestique,bliss,CC0-1.0,chat\n" +
                "chien,fr,5,900,0.3,Ami fidèle,bliss,CC0-1.0,chien\n",
        )

        val repo = CsvWordRepository.frenchFromDir(tmp)

        assertThat(repo.findByLength(4)).isNotEmpty()
        assertThat(repo.findByLength(5)).isNotEmpty()
    }

    @Test
    fun `frenchCorpus falls back to the classpath corpus when CORPUS_DIR is unset`() {
        // The test JVM has no CORPUS_DIR, so this exercises the transitional classpath path.
        val repo = CsvWordRepository.frenchCorpus()

        assertThat(repo.findByLength(5)).isNotEmpty()
    }
}
