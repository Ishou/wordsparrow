package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.correction.SeedReplacement
import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVParser
import java.nio.file.Files
import java.nio.file.Path

/** Reads a `word,old_clue,new_clue` RFC 4180 seed source into [SeedReplacement]s (ADR-0108 amendment 2026-07-24). */
class CsvCorrectionSeedSource(
    private val path: Path,
) {
    fun read(): List<SeedReplacement> =
        Files.newBufferedReader(path).use { reader ->
            val format =
                CSVFormat.RFC4180
                    .builder()
                    .setHeader()
                    .setSkipHeaderRecord(true)
                    .build()
            CSVParser.parse(reader, format).use { parser ->
                require(parser.headerNames.containsAll(REQUIRED)) {
                    "seed source $path must have columns $REQUIRED, found ${parser.headerNames}"
                }
                // Clue text is exact-matched against grid payloads, so preserve it verbatim; only the cell surface is trimmed.
                parser.records.map {
                    SeedReplacement(
                        wordText = it.get(WORD).trim(),
                        oldClueText = it.get(OLD),
                        newClueText = it.get(NEW),
                    )
                }
            }
        }

    companion object {
        private const val WORD = "word"
        private const val OLD = "old_clue"
        private const val NEW = "new_clue"
        private val REQUIRED = listOf(WORD, OLD, NEW)
    }
}
