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

// JDBC is blocking; every method dispatches to IO; the optimistic-concurrency guard is atomic in SQL (ADR-0075).
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

    override suspend fun countByUser(userId: UserId): Int =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(COUNT_BY_USER_SQL).use { stmt ->
                    stmt.setObject(1, userId.value)
                    stmt.executeQuery().use { rs -> if (rs.next()) rs.getInt(1) else 0 }
                }
            }
        }

    // expectedUpdatedAt null ⇒ WHERE guard passes; DO UPDATE WHERE never matches NULL, so existing rows report Conflict. Non-null + no row ⇒ EXISTS false, INSERT skipped → Conflict (matches InMemory). Non-null + row ⇒ EXISTS passes; DO UPDATE WHERE checks timestamp (ADR-0075).
    override suspend fun upsert(
        progress: PuzzleProgress,
        expectedUpdatedAt: Instant?,
    ): UpsertOutcome =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(UPSERT_SQL).use { stmt ->
                    val ts = expectedUpdatedAt?.truncatedTo(ChronoUnit.MICROS)?.atOffset(ZoneOffset.UTC)
                    stmt.setObject(1, progress.userId.value)
                    stmt.setObject(2, progress.puzzleId.value)
                    stmt.setObject(3, jsonb(progress.payload))
                    stmt.setObject(4, progress.updatedAt.truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC))
                    stmt.setObject(5, ts)
                    stmt.setObject(6, progress.userId.value)
                    stmt.setObject(7, progress.puzzleId.value)
                    stmt.setObject(8, ts)
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
        private const val COUNT_BY_USER_SQL =
            "SELECT COUNT(*) FROM puzzle_progress WHERE user_id = ?"
        private const val UPSERT_SQL =
            "INSERT INTO puzzle_progress (user_id, puzzle_id, payload, updated_at) " +
                "SELECT ?, ?, ?, ? WHERE CAST(? AS TIMESTAMPTZ) IS NULL OR EXISTS " +
                "(SELECT 1 FROM puzzle_progress WHERE user_id = ? AND puzzle_id = ?) " +
                "ON CONFLICT (user_id, puzzle_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at " +
                "WHERE puzzle_progress.updated_at = ? " +
                "RETURNING updated_at"
    }
}
