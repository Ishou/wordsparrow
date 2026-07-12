package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.correction.BlocklistPreview
import com.bliss.grid.application.correction.BlocklistPreviewQuery
import javax.sql.DataSource

/** Counts stored grids whose payload places the folded word, split by daily vs solo (puzzle_date IS NULL) -- ADR-0110 §4. */
class PostgresBlocklistPreviewQuery(
    private val dataSource: DataSource,
) : BlocklistPreviewQuery {
    override fun preview(word: String): BlocklistPreview =
        dataSource.connection.use { conn ->
            conn.prepareStatement(PREVIEW_SQL).use { stmt ->
                stmt.setString(1, word.uppercase())
                stmt.executeQuery().use { rs ->
                    if (rs.next()) {
                        BlocklistPreview(affectedDailies = rs.getInt("dailies"), affectedSolo = rs.getInt("solo"))
                    } else {
                        BlocklistPreview(0, 0)
                    }
                }
            }
        }

    companion object {
        // Seq scan over the small puzzles table; matches a placement's folded wordText inside the JSONB payload.
        private const val PREVIEW_SQL =
            "SELECT " +
                "count(*) FILTER (WHERE p.puzzle_date IS NOT NULL) AS dailies, " +
                "count(*) FILTER (WHERE p.puzzle_date IS NULL) AS solo " +
                "FROM puzzles p WHERE EXISTS (" +
                "SELECT 1 FROM jsonb_array_elements(p.payload->'placements') AS pl WHERE pl->>'wordText' = ?)"
    }
}
