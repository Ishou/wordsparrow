package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.correction.ClueOverrideAppender
import com.bliss.grid.application.correction.ClueOverrideRow
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption.APPEND
import java.nio.file.StandardOpenOption.CREATE

/** Appends override rows to the `word,clue,note` CSV the Python corpus pipeline merges (ADR-0108 §3). */
class CsvClueOverrideAppender(
    private val csvPath: Path,
) : ClueOverrideAppender {
    override fun append(rows: List<ClueOverrideRow>) {
        if (rows.isEmpty()) return
        val writeHeader = !Files.exists(csvPath)
        csvPath.parent?.let { Files.createDirectories(it) }
        Files.newBufferedWriter(csvPath, CREATE, APPEND).use { writer ->
            if (writeHeader) writer.appendLine(HEADER)
            rows.forEach { writer.appendLine(csvLine(it)) }
        }
    }

    private fun csvLine(row: ClueOverrideRow): String = listOf(row.word, row.clue, row.note).joinToString(",", transform = ::escape)

    // RFC 4180: quote fields that carry a delimiter, quote, or newline; double embedded quotes.
    private fun escape(field: String): String =
        if (field.any { it == ',' || it == '"' || it == '\n' || it == '\r' }) {
            "\"" + field.replace("\"", "\"\"") + "\""
        } else {
            field
        }

    companion object {
        private const val HEADER = "word,clue,note"
    }
}
