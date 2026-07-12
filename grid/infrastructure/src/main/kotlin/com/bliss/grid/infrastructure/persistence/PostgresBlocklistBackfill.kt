package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.correction.BlocklistBackfillPort
import com.bliss.grid.application.correction.BlocklistWork
import java.time.LocalDate
import java.util.UUID
import javax.sql.DataSource

/** Finds stored grids still placing a blocklisted word (daily = latest row per date) and deletes solo grids -- ADR-0110 §2. */
class PostgresBlocklistBackfill(
    private val dataSource: DataSource,
) : BlocklistBackfillPort {
    override fun remainingWork(word: String): BlocklistWork {
        val folded = word.uppercase()
        return dataSource.connection.use { conn ->
            val dates =
                conn.prepareStatement(DAILY_SQL).use { stmt ->
                    stmt.setString(1, folded)
                    stmt.executeQuery().use { rs ->
                        buildList { while (rs.next()) add(rs.getObject("puzzle_date", LocalDate::class.java)) }
                    }
                }
            val solos =
                conn.prepareStatement(SOLO_SQL).use { stmt ->
                    stmt.setString(1, folded)
                    stmt.executeQuery().use { rs ->
                        buildList { while (rs.next()) add(rs.getObject("puzzle_id", UUID::class.java)) }
                    }
                }
            BlocklistWork(dailyDates = dates, soloIds = solos)
        }
    }

    override fun deleteSolo(puzzleId: UUID): Boolean =
        dataSource.connection.use { conn ->
            conn.prepareStatement(DELETE_SOLO_SQL).use { stmt ->
                stmt.setObject(1, puzzleId)
                stmt.executeUpdate() > 0
            }
        }

    companion object {
        // Only the latest row per date counts, so a regenerated daily's newer word-free row makes the date drop out (ADR-0081 latest-wins).
        private const val DAILY_SQL =
            "SELECT d.puzzle_date FROM (" +
                "SELECT DISTINCT ON (puzzle_date) puzzle_date, payload FROM puzzles " +
                "WHERE puzzle_date IS NOT NULL ORDER BY puzzle_date, created_at DESC" +
                ") d WHERE EXISTS (" +
                "SELECT 1 FROM jsonb_array_elements(d.payload->'placements') AS pl WHERE pl->>'wordText' = ?)"

        private const val SOLO_SQL =
            "SELECT puzzle_id FROM puzzles WHERE puzzle_date IS NULL AND EXISTS (" +
                "SELECT 1 FROM jsonb_array_elements(payload->'placements') AS pl WHERE pl->>'wordText' = ?)"

        // Guard puzzle_date IS NULL so a daily is never deleted by id (dailies are regenerated, not deleted).
        private const val DELETE_SOLO_SQL = "DELETE FROM puzzles WHERE puzzle_id = ? AND puzzle_date IS NULL"
    }
}
