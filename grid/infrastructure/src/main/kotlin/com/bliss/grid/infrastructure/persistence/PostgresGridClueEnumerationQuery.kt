package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.correction.GridClueEnumerationQuery
import com.bliss.grid.application.correction.GridClueUsage
import javax.sql.DataSource

/** Enumerates distinct (wordText, chosen clue text) pairs from stored grid payloads; mirrors the correction match path (ADR-0108). */
class PostgresGridClueEnumerationQuery(
    private val dataSource: DataSource,
) : GridClueEnumerationQuery {
    override fun enumerate(words: Set<String>): List<GridClueUsage> {
        val folded = words.map { it.uppercase() }
        return dataSource.connection.use { conn ->
            val sql = if (folded.isEmpty()) ENUMERATE_ALL_SQL else ENUMERATE_FILTERED_SQL
            conn.prepareStatement(sql).use { stmt ->
                if (folded.isNotEmpty()) stmt.setArray(1, conn.createArrayOf("text", folded.toTypedArray()))
                stmt.executeQuery().use { rs ->
                    buildList {
                        while (rs.next()) add(GridClueUsage(wordText = rs.getString("word"), clueText = rs.getString("clue")))
                    }
                }
            }
        }
    }

    companion object {
        // A placement's chosen clue text keyed by its wordText -- the exact pair the correction backfill text-joins on.
        private const val ENUMERATE_ALL_SQL =
            "SELECT DISTINCT pl->>'wordText' AS word, " +
                "(pl->'clues'->((pl->>'chosenClueIndex')::int)->>'text') AS clue " +
                "FROM puzzles p, jsonb_array_elements(coalesce(p.payload->'placements', '[]'::jsonb)) AS pl " +
                "WHERE pl->>'wordText' IS NOT NULL " +
                "AND (pl->'clues'->((pl->>'chosenClueIndex')::int)->>'text') IS NOT NULL"

        private const val ENUMERATE_FILTERED_SQL = "$ENUMERATE_ALL_SQL AND pl->>'wordText' = ANY(?)"
    }
}
