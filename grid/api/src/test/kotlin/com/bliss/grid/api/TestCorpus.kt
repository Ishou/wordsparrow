package com.bliss.grid.api

import com.bliss.grid.infrastructure.persistence.CsvWordRepository
import java.nio.file.Path

/**
 * Test-only corpus: real French words with placeholder clues (`Définition`),
 * loaded from `src/test/resources/mock-corpus`. The production corpus lives in
 * private object storage (ADR-0097) and is not committed; tests exercise the
 * generator against the same word/length distribution without shipping real
 * clue text.
 */
object TestCorpus {
    fun load(): CsvWordRepository {
        val url =
            requireNotNull(TestCorpus::class.java.getResource("/mock-corpus")) {
                "mock-corpus test resource missing"
            }
        return CsvWordRepository.frenchFromDir(Path.of(url.toURI()))
    }
}
