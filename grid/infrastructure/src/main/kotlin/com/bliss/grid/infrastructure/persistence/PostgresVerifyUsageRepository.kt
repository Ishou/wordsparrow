package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.puzzle.VerifyCooldownCalculator
import com.bliss.grid.application.puzzle.VerifyUsageRepository
import java.sql.Connection
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

/** Postgres-backed [VerifyUsageRepository]; [tryRecord] runs on the caller's advisory-locked connection, [deleteByUser] takes the lock itself. */
class PostgresVerifyUsageRepository(
    private val dataSource: DataSource,
) : VerifyUsageRepository {
    override fun tryRecord(
        conn: Connection,
        puzzleId: UUID,
        userId: UUID,
        now: Instant,
    ): VerifyCooldownCalculator.Result {
        val cooldown = VerifyCooldownCalculator.view(readLastVerifiedAt(conn, puzzleId, userId), now)
        if (!cooldown.allowed) return cooldown
        conn.prepareStatement(UPSERT_SQL).use { stmt ->
            stmt.setObject(1, puzzleId)
            stmt.setObject(2, userId)
            stmt.setTimestamp(3, Timestamp.from(now))
            stmt.executeUpdate()
        }
        // A successful record always starts a fresh full-length cooldown, not the pre-write remainder.
        return VerifyCooldownCalculator.Result(true, VerifyCooldownCalculator.COOLDOWN_SECONDS)
    }

    override fun cooldownFor(
        puzzleId: UUID,
        userId: UUID,
        now: Instant,
    ): VerifyCooldownCalculator.Result =
        dataSource.connection.use { conn ->
            VerifyCooldownCalculator.view(readLastVerifiedAt(conn, puzzleId, userId), now)
        }

    private fun readLastVerifiedAt(
        conn: Connection,
        puzzleId: UUID,
        userId: UUID,
    ): Instant? =
        conn.prepareStatement(SELECT_SQL).use { stmt ->
            stmt.setObject(1, puzzleId)
            stmt.setObject(2, userId)
            stmt.executeQuery().use { rs ->
                if (rs.next()) rs.getTimestamp("last_verified_at").toInstant() else null
            }
        }

    override fun deleteByUser(userId: UUID): Int =
        dataSource.connection.use { conn ->
            val previousAutoCommit = conn.autoCommit
            conn.autoCommit = false
            try {
                conn.prepareStatement(LOCK_SQL).use { stmt ->
                    stmt.setString(1, "user:$userId")
                    stmt.execute()
                }
                val rows =
                    conn.prepareStatement(DELETE_BY_USER_SQL).use { stmt ->
                        stmt.setObject(1, userId)
                        stmt.executeUpdate()
                    }
                conn.commit()
                rows
            } catch (cause: Throwable) {
                conn.rollback()
                throw cause
            } finally {
                conn.autoCommit = previousAutoCommit
            }
        }

    companion object {
        private const val SELECT_SQL =
            "SELECT last_verified_at FROM puzzle_verify_usage WHERE puzzle_id = ? AND user_id = ?"

        private const val UPSERT_SQL =
            """
            INSERT INTO puzzle_verify_usage (puzzle_id, user_id, last_verified_at)
            VALUES (?, ?, ?)
            ON CONFLICT (puzzle_id, user_id) DO UPDATE
                SET last_verified_at = EXCLUDED.last_verified_at
            """

        private const val DELETE_BY_USER_SQL =
            "DELETE FROM puzzle_verify_usage WHERE user_id = ?"

        private const val LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtext(?))"
    }
}
