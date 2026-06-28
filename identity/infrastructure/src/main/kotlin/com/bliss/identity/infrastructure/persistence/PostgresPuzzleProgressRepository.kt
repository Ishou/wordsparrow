package com.bliss.identity.infrastructure.persistence

import com.bliss.identity.application.ports.ProgressRepository
import com.bliss.identity.application.ports.UpsertOutcome
import com.bliss.identity.domain.progress.PuzzleId
import com.bliss.identity.domain.progress.PuzzleProgress
import com.bliss.identity.domain.user.UserId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.postgresql.util.PGobject
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID
import javax.sql.DataSource

/**
 * Postgres-backed [ProgressRepository]. JDBC is blocking; every method wraps its calls in
 * `withContext(Dispatchers.IO)`. The optimistic-concurrency guard lives in the SQL `WHERE`
 * clause so the check-and-write is atomic (ADR-0075).
 */
class PostgresPuzzleProgressRepository(
    private val dataSource: DataSource,
) : ProgressRepository {
    override suspend fun findByUser(userId: UserId): List<PuzzleProgress> =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(SELECT_BY_USER_SQL).use { stmt ->
                    stmt.setObject(1, userId.value)
                    stmt.executeQuery().use { rs ->
                        buildList { while (rs.next()) add(rs.toProgress(userId)) }
                    }
                }
            }
        }

    override suspend fun find(
        userId: UserId,
        puzzleId: PuzzleId,
    ): PuzzleProgress? =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(SELECT_ONE_SQL).use { stmt ->
                    stmt.setObject(1, userId.value)
                    stmt.setObject(2, puzzleId.value)
                    stmt.executeQuery().use { rs -> if (rs.next()) rs.toProgress(userId) else null }
                }
            }
        }

    // expectedUpdatedAt null ⇒ the ON CONFLICT WHERE never matches (NULL compare), so an existing row is left untouched and reported as Conflict; a fresh INSERT still succeeds.
    override suspend fun upsert(
        progress: PuzzleProgress,
        expectedUpdatedAt: Instant?,
    ): UpsertOutcome =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(UPSERT_SQL).use { stmt ->
                    stmt.setObject(1, progress.userId.value)
                    stmt.setObject(2, progress.puzzleId.value)
                    stmt.setObject(3, jsonb(progress.payload))
                    stmt.setObject(4, progress.updatedAt.truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC))
                    stmt.setObject(
                        5,
                        expectedUpdatedAt?.truncatedTo(ChronoUnit.MICROS)?.atOffset(ZoneOffset.UTC),
                    )
                    stmt.executeQuery().use { rs ->
                        if (rs.next()) {
                            UpsertOutcome.Written(rs.getObject("updated_at", OffsetDateTime::class.java).toInstant())
                        } else {
                            UpsertOutcome.Conflict
                        }
                    }
                }
            }
        }

    private fun ResultSet.toProgress(userId: UserId): PuzzleProgress =
        PuzzleProgress(
            userId = userId,
            puzzleId = PuzzleId(getObject("puzzle_id", UUID::class.java)),
            payload = getString("payload"),
            updatedAt = getObject("updated_at", OffsetDateTime::class.java).toInstant(),
        )

    private fun jsonb(value: String): PGobject =
        PGobject().apply {
            type = "jsonb"
            this.value = value
        }

    companion object {
        private const val SELECT_BY_USER_SQL =
            "SELECT puzzle_id, payload, updated_at FROM puzzle_progress WHERE user_id = ?"
        private const val SELECT_ONE_SQL =
            "SELECT puzzle_id, payload, updated_at FROM puzzle_progress WHERE user_id = ? AND puzzle_id = ?"
        private const val UPSERT_SQL =
            "INSERT INTO puzzle_progress (user_id, puzzle_id, payload, updated_at) VALUES (?, ?, ?, ?) " +
                "ON CONFLICT (user_id, puzzle_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at " +
                "WHERE puzzle_progress.updated_at = ? " +
                "RETURNING updated_at"
    }
}
