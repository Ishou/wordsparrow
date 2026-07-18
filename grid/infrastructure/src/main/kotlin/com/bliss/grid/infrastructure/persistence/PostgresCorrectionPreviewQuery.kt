package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.correction.CorrectionPreview
import com.bliss.grid.application.correction.CorrectionPreviewQuery
import java.sql.Types
import javax.sql.DataSource

/** Counts stored grids whose chosen clue for a placement equals oldClueText (optionally narrowed by folded wordText), split daily vs solo -- ADR-0108. */
class PostgresCorrectionPreviewQuery(
    private val dataSource: DataSource,
) : CorrectionPreviewQuery {
    override fun preview(
        oldClueText: String,
        wordText: String?,
    ): CorrectionPreview =
        dataSource.connection.use { conn ->
            conn.prepareStatement(PREVIEW_SQL).use { stmt ->
                val folded = wordText?.uppercase()
                stmt.setString(1, oldClueText)
                if (folded != null) stmt.setString(2, folded) else stmt.setNull(2, Types.VARCHAR)
                if (folded != null) stmt.setString(3, folded) else stmt.setNull(3, Types.VARCHAR)
                stmt.executeQuery().use { rs ->
                    if (rs.next()) {
                        CorrectionPreview(affectedDailies = rs.getInt("dailies"), affectedSolo = rs.getInt("solo"))
                    } else {
                        CorrectionPreview(0, 0)
                    }
                }
            }
        }

    companion object {
        // Mirrors the backfill MATCH_PREDICATE: a placement whose chosen clue text equals oldClueText, optionally narrowed by folded wordText.
        private const val PREVIEW_SQL =
            "SELECT " +
                "count(*) FILTER (WHERE p.puzzle_date IS NOT NULL) AS dailies, " +
                "count(*) FILTER (WHERE p.puzzle_date IS NULL) AS solo " +
                "FROM puzzles p WHERE EXISTS (" +
                "SELECT 1 FROM jsonb_array_elements(p.payload->'placements') AS pl " +
                "WHERE (pl->'clues'->((pl->>'chosenClueIndex')::int)->>'text') = ? " +
                "AND (?::text IS NULL OR pl->>'wordText' = ?))"
    }
}
