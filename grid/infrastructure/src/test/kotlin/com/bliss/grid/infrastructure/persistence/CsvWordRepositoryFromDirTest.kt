package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import assertk.assertions.isNotEmpty
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable
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
        assertThat(repo.findByLength(4).single { it.text == "CHAT" }.pos).isEqualTo("")
    }

    @Test
    fun `reads the optional pos column into Word for fill priority`(
        @TempDir tmp: Path,
    ) {
        val words = Files.createDirectories(tmp.resolve("words"))
        Files.writeString(
            words.resolve("words-fr.csv"),
            "word,language,length,frequency,difficulty,clue,source,source_license,pos,lemma\n" +
                "chat,fr,4,1000,0.3,Félin domestique,bliss,CC0-1.0,nom,chat\n",
        )

        val repo = CsvWordRepository.frenchFromDir(tmp)

        assertThat(repo.findByLength(4).single { it.text == "CHAT" }.pos).isEqualTo("nom")
    }

    @Test
    fun `bridges an inflected participle-adjective to its verb for family dedup`(
        @TempDir tmp: Path,
    ) {
        // grammalecte tags émanée as adj (lemma émané→EMANE); the corpus keeps that one lemma,
        // so grid dedup would miss that it is the same family as the verb émaner→EMANER. The
        // loader must bridge it from the grammalecte-derived participle edges (main resource).
        val words = Files.createDirectories(tmp.resolve("words"))
        Files.writeString(
            words.resolve("words-fr.csv"),
            "word,language,length,frequency,difficulty,clue,source,source_license,pos,lemma\n" +
                "émaner,fr,6,100,0.3,Provenir de,bliss,CC0-1.0,verbe,émaner\n" +
                "émanée,fr,6,100,0.3,Qui provient,bliss,CC0-1.0,adj,émané\n",
        )

        val repo = CsvWordRepository.frenchFromDir(tmp)

        assertThat(repo.surfaceLemmas().lemmasOf("EMANEE")).contains("EMANER")
    }

    @Test
    @DisabledIfEnvironmentVariable(named = "CORPUS_DIR", matches = ".+")
    fun `frenchCorpus fails fast when CORPUS_DIR is unset`() {
        // ADR-0097: the corpus is served from object storage, not the classpath.
        // With no CORPUS_DIR there is nothing to load, so it must throw.
        assertThrows<IllegalStateException> { CsvWordRepository.frenchCorpus() }
    }
}
