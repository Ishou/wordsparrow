package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.puzzle.PuzzleRepository
import com.bliss.grid.application.puzzle.StoredDailyPuzzle
import com.bliss.grid.application.puzzle.StoredPuzzle
import com.bliss.grid.application.puzzle.StoredSummary
import kotlinx.serialization.json.Json
import org.postgresql.util.PGobject
import java.sql.Date
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.LocalDate
import java.util.UUID
import javax.sql.DataSource

/**
 * Postgres-backed [PuzzleRepository]. Single-row reads on hit, two
 * statements on miss (factory + INSERT-or-SELECT). The "INSERT ... ON
 * CONFLICT DO NOTHING; SELECT" idiom serves as the canonical race-free
 * getOrCompute under low contention — single-replica posture, no advisory
 * locks needed at this scale.
 *
 * Puzzle JSON shape lives in [PuzzlePayload]; this class wraps it with the
 * row-level metadata (title, language, hints_allowed, created_at).
 */
class PostgresPuzzleRepository(
    private val dataSource: DataSource,
    private val json: Json =
        Json {
            ignoreUnknownKeys = false
            encodeDefaults = true
        },
) : PuzzleRepository {
    override fun get(puzzleId: UUID): StoredPuzzle? =
        dataSource.connection.use { conn ->
            conn.prepareStatement(SELECT_SQL).use { stmt ->
                stmt.setObject(1, puzzleId)
                stmt.executeQuery().use { rs ->
                    if (rs.next()) rs.toStoredPuzzle() else null
                }
            }
        }

    override fun getOrCompute(
        puzzleId: UUID,
        factory: () -> StoredPuzzle?,
    ): StoredPuzzle? {
        get(puzzleId)?.let { return it }
        val produced = factory() ?: return null
        dataSource.connection.use { conn ->
            conn.prepareStatement(INSERT_SQL).use { stmt ->
                stmt.setObject(1, puzzleId)
                stmt.setInt(2, produced.grid.width)
                stmt.setInt(3, produced.grid.height)
                stmt.setString(4, produced.language)
                stmt.setString(5, produced.title)
                stmt.setObject(6, jsonbOf(produced))
                stmt.setInt(7, produced.hintsAllowed)
                stmt.setTimestamp(8, Timestamp.from(produced.createdAt))
                stmt.setInt(9, produced.totalLetterCells)
                stmt.executeUpdate()
            }
        }
        // A concurrent inserter may have won the race — read back the
        // canonical row so all callers observe identical state.
        return get(puzzleId) ?: produced
    }

    override fun getCurrentForDate(date: LocalDate): StoredDailyPuzzle? =
        dataSource.connection.use { conn ->
            conn.prepareStatement(SELECT_CURRENT_FOR_DATE_SQL).use { stmt ->
                stmt.setObject(1, date)
                stmt.executeQuery().use { rs ->
                    if (rs.next()) {
                        StoredDailyPuzzle(
                            puzzleId = rs.getObject("puzzle_id", UUID::class.java),
                            puzzle = rs.toStoredPuzzle(),
                        )
                    } else {
                        null
                    }
                }
            }
        }

    override fun insertDaily(
        puzzleId: UUID,
        puzzleDate: LocalDate,
        stored: StoredPuzzle,
    ) {
        dataSource.connection.use { conn ->
            conn.prepareStatement(INSERT_DAILY_SQL).use { stmt ->
                stmt.setObject(1, puzzleId)
                stmt.setInt(2, stored.grid.width)
                stmt.setInt(3, stored.grid.height)
                stmt.setString(4, stored.language)
                stmt.setString(5, stored.title)
                stmt.setObject(6, jsonbOf(stored))
                stmt.setInt(7, stored.hintsAllowed)
                stmt.setTimestamp(8, Timestamp.from(stored.createdAt))
                stmt.setInt(9, stored.totalLetterCells)
                stmt.setObject(10, puzzleDate)
                stmt.executeUpdate()
            }
        }
    }

    override fun findCurrentSummariesByDates(dates: List<LocalDate>): List<StoredSummary> {
        if (dates.isEmpty()) return emptyList()
        return dataSource.connection.use { conn ->
            val arr = conn.createArrayOf("date", dates.map { Date.valueOf(it) }.toTypedArray())
            conn.prepareStatement(CURRENT_SUMMARIES_SQL).use { stmt ->
                stmt.setArray(1, arr)
                stmt.executeQuery().use { rs ->
                    buildList {
                        while (rs.next()) {
                            add(
                                StoredSummary(
                                    puzzleId = rs.getObject("puzzle_id", UUID::class.java),
                                    totalLetterCells = rs.getInt("total_letter_cells"),
                                    puzzleDate = rs.getObject("puzzle_date", LocalDate::class.java),
                                ),
                            )
                        }
                    }
                }
            }
        }
    }

    override fun findSummariesByIds(puzzleIds: List<UUID>): List<StoredSummary> {
        if (puzzleIds.isEmpty()) return emptyList()
        return dataSource.connection.use { conn ->
            val arr = conn.createArrayOf("uuid", puzzleIds.toTypedArray())
            conn.prepareStatement(SUMMARIES_SQL).use { stmt ->
                stmt.setArray(1, arr)
                stmt.executeQuery().use { rs ->
                    buildList {
                        while (rs.next()) {
                            add(
                                StoredSummary(
                                    puzzleId = rs.getObject("puzzle_id", UUID::class.java),
                                    totalLetterCells = rs.getInt("total_letter_cells"),
                                ),
                            )
                        }
                    }
                }
            }
        }
    }

    private fun jsonbOf(stored: StoredPuzzle): PGobject =
        PGobject().apply {
            type = "jsonb"
            value = json.encodeToString(PuzzlePayload.serializer(), PuzzlePayload.fromGrid(stored.grid))
        }

    private fun ResultSet.toStoredPuzzle(): StoredPuzzle {
        val payloadJson = getString("payload")
        val payload = json.decodeFromString(PuzzlePayload.serializer(), payloadJson)
        return StoredPuzzle(
            grid = payload.toGrid(),
            title = getString("title"),
            language = getString("language"),
            hintsAllowed = getInt("hints_allowed"),
            createdAt = getTimestamp("created_at").toInstant(),
        )
    }

    companion object {
        private const val SELECT_SQL =
            "SELECT puzzle_id, width, height, language, title, payload, hints_allowed, created_at " +
                "FROM puzzles WHERE puzzle_id = ?"

        private const val INSERT_SQL =
            "INSERT INTO puzzles " +
                "(puzzle_id, width, height, language, title, payload, hints_allowed, created_at, " +
                "total_letter_cells) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (puzzle_id) DO NOTHING"

        private const val INSERT_DAILY_SQL =
            "INSERT INTO puzzles " +
                "(puzzle_id, width, height, language, title, payload, hints_allowed, created_at, " +
                "total_letter_cells, puzzle_date) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"

        private const val SELECT_CURRENT_FOR_DATE_SQL =
            "SELECT puzzle_id, width, height, language, title, payload, hints_allowed, created_at " +
                "FROM puzzles WHERE puzzle_date = ? ORDER BY created_at DESC LIMIT 1"

        private const val SUMMARIES_SQL =
            "SELECT puzzle_id, total_letter_cells " +
                "FROM puzzles " +
                "WHERE puzzle_id = ANY(?) AND total_letter_cells IS NOT NULL"

        // DISTINCT ON keeps the newest row per date (ADR-0081: regeneration appends, latest wins).
        private const val CURRENT_SUMMARIES_SQL =
            "SELECT DISTINCT ON (puzzle_date) puzzle_id, puzzle_date, total_letter_cells " +
                "FROM puzzles " +
                "WHERE puzzle_date = ANY(?) AND total_letter_cells IS NOT NULL " +
                "ORDER BY puzzle_date, created_at DESC"
    }
}
