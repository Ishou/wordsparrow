package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.correction.GridBackfillPort
import com.bliss.grid.application.correction.PatchBatchResult
import com.bliss.grid.domain.correction.ClueCorrection
import kotlinx.serialization.json.Json
import org.postgresql.util.PGobject
import org.slf4j.LoggerFactory
import java.sql.PreparedStatement
import java.time.LocalDate
import java.util.UUID
import javax.sql.DataSource

private val log = LoggerFactory.getLogger("com.bliss.grid.infrastructure.persistence.PostgresGridBackfill")

/** Patches `puzzles.payload` JSONB for a correction; matching key is the chosen clue text, so a patched row drops out (ADR-0108 §4). */
class PostgresGridBackfill(
    private val dataSource: DataSource,
    private val json: Json =
        Json {
            ignoreUnknownKeys = false
            encodeDefaults = true
        },
) : GridBackfillPort {
    override fun countMatching(correction: ClueCorrection): Int =
        dataSource.connection.use { conn ->
            conn.prepareStatement(COUNT_SQL).use { stmt ->
                bindPredicate(stmt, correction)
                stmt.executeQuery().use { rs -> if (rs.next()) rs.getInt(1) else 0 }
            }
        }

    override fun patchBatch(
        correction: ClueCorrection,
        limit: Int,
    ): PatchBatchResult {
        val rows = selectBatch(correction, limit)
        var patched = 0
        var failed = 0
        var lastError: String? = null
        val patchedDates = mutableListOf<LocalDate>()
        for (row in rows) {
            try {
                val original = json.decodeFromString(PuzzlePayload.serializer(), row.payload)
                val corrected = ClueCorrectionPayloadPatch.apply(original, correction)
                // A no-op (new clue equals old) would never leave the queue; surface it rather than spin (ADR-0108 §4).
                if (corrected == original) {
                    failed++
                    lastError = "correction is a no-op for puzzle ${row.puzzleId}"
                    continue
                }
                updatePayload(row.puzzleId, corrected)
                patched++
                if (row.puzzleDate != null) patchedDates.add(row.puzzleDate)
            } catch (e: Exception) {
                failed++
                lastError = e.message ?: e.toString()
                log.warn("event=backfill_grid_failed puzzle_id={} error=\"{}\"", row.puzzleId, lastError)
            }
        }
        return PatchBatchResult(patched, failed, lastError, patchedDates)
    }

    private data class BackfillRow(
        val puzzleId: UUID,
        val payload: String,
        val puzzleDate: LocalDate?,
    )

    private fun selectBatch(
        correction: ClueCorrection,
        limit: Int,
    ): List<BackfillRow> =
        dataSource.connection.use { conn ->
            conn.prepareStatement(SELECT_BATCH_SQL).use { stmt ->
                bindPredicate(stmt, correction)
                stmt.setInt(4, limit)
                stmt.executeQuery().use { rs ->
                    buildList {
                        while (rs.next()) {
                            add(
                                BackfillRow(
                                    puzzleId = rs.getObject("puzzle_id", UUID::class.java),
                                    payload = rs.getString("payload"),
                                    puzzleDate = rs.getObject("puzzle_date", LocalDate::class.java),
                                ),
                            )
                        }
                    }
                }
            }
        }

    private fun updatePayload(
        puzzleId: UUID,
        payload: PuzzlePayload,
    ) {
        dataSource.connection.use { conn ->
            conn.prepareStatement(UPDATE_SQL).use { stmt ->
                stmt.setObject(1, jsonbOf(payload))
                stmt.setObject(2, puzzleId)
                stmt.executeUpdate()
            }
        }
    }

    private fun jsonbOf(payload: PuzzlePayload): PGobject =
        PGobject().apply {
            type = "jsonb"
            value = json.encodeToString(PuzzlePayload.serializer(), payload)
        }

    private fun bindPredicate(
        stmt: PreparedStatement,
        correction: ClueCorrection,
    ) {
        val foldedWord = correction.wordText?.uppercase()
        stmt.setString(1, correction.oldClueText)
        stmt.setString(2, foldedWord)
        stmt.setString(3, foldedWord)
    }

    companion object {
        // Match on the chosen clue's text (clues[chosenClueIndex]); an optional word narrows it. Seq scan — puzzles is small.
        private const val MATCH_PREDICATE =
            "EXISTS (SELECT 1 FROM jsonb_array_elements(p.payload->'placements') AS pl " +
                "WHERE (pl->'clues'->((pl->>'chosenClueIndex')::int)->>'text') = ? " +
                "AND (?::text IS NULL OR pl->>'wordText' = ?))"

        private const val COUNT_SQL = "SELECT count(*) FROM puzzles p WHERE $MATCH_PREDICATE"

        private const val SELECT_BATCH_SQL =
            "SELECT p.puzzle_id, p.payload, p.puzzle_date FROM puzzles p WHERE $MATCH_PREDICATE " +
                "ORDER BY p.created_at, p.puzzle_id LIMIT ?"

        private const val UPDATE_SQL = "UPDATE puzzles SET payload = ? WHERE puzzle_id = ?"
    }
}
