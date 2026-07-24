package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.correction.GridClueUsage
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption.CREATE
import java.nio.file.StandardOpenOption.TRUNCATE_EXISTING
import java.nio.file.StandardOpenOption.WRITE

/** Writes enumerated grid clues to a `word,old_clue` RFC 4180 CSV -- the input to the seed-source builder (ADR-0108 amendment 2026-07-24). */
class CsvGridClueSink(
    private val path: Path,
) {
    fun write(rows: List<GridClueUsage>) {
        path.parent?.let { Files.createDirectories(it) }
        Files.newBufferedWriter(path, CREATE, TRUNCATE_EXISTING, WRITE).use { writer ->
            writer.appendLine(HEADER)
            rows.forEach { writer.appendLine(listOf(it.wordText, it.clueText).joinToString(",", transform = ::escape)) }
        }
    }

    // RFC 4180: quote fields carrying a delimiter, quote, or newline; double embedded quotes.
    private fun escape(field: String): String =
        if (field.any { it == ',' || it == '"' || it == '\n' || it == '\r' }) {
            "\"" + field.replace("\"", "\"\"") + "\""
        } else {
            field
        }

    companion object {
        private const val HEADER = "word,old_clue"
    }
}
