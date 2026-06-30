package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.puzzle.HintBudgetCalculator
import com.bliss.grid.application.puzzle.HintUsageRepository
import java.sql.Connection
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

/** Postgres-backed [HintUsageRepository]; [trySpend] runs on the caller's advisory-locked connection, [deleteByUser] takes the lock itself. */
class PostgresHintUsageRepository(
    private val dataSource: DataSource,
) : HintUsageRepository {
    override fun trySpend(
        conn: Connection,
        puzzleId: UUID,
        userId: UUID,
        capacity: Int,
        interval: Duration,
        now: Instant,
    ): HintBudgetCalculator.View? {
        val state = readState(conn, puzzleId, userId, capacity)
        val next = HintBudgetCalculator.spend(state, now, capacity, interval) ?: return null
        conn.prepareStatement(UPSERT_SQL).use { stmt ->
            stmt.setObject(1, puzzleId)
            stmt.setObject(2, userId)
            stmt.setInt(3, next.tokens)
            stmt.setTimestamp(4, Timestamp.from(next.anchor ?: now))
            stmt.setTimestamp(5, Timestamp.from(now))
            stmt.executeUpdate()
        }
        return HintBudgetCalculator.view(next, now, capacity, interval)
    }

    override fun budgetFor(
        puzzleId: UUID,
        userId: UUID,
        capacity: Int,
        interval: Duration,
        now: Instant,
    ): HintBudgetCalculator.View =
        dataSource.connection.use { conn ->
            HintBudgetCalculator.view(readState(conn, puzzleId, userId, capacity), now, capacity, interval)
        }

    private fun readState(
        conn: Connection,
        puzzleId: UUID,
        userId: UUID,
        capacity: Int,
    ): HintBudgetCalculator.State =
        conn.prepareStatement(SELECT_SQL).use { stmt ->
            stmt.setObject(1, puzzleId)
            stmt.setObject(2, userId)
            stmt.executeQuery().use { rs ->
                if (rs.next()) {
                    HintBudgetCalculator.State(rs.getInt("tokens_remaining"), rs.getTimestamp("refill_anchor").toInstant())
                } else {
                    HintBudgetCalculator.State(capacity, null)
                }
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
            "SELECT tokens_remaining, refill_anchor FROM puzzle_hint_usage WHERE puzzle_id = ? AND user_id = ?"

        private const val UPSERT_SQL =
            """
            INSERT INTO puzzle_hint_usage (puzzle_id, user_id, tokens_remaining, refill_anchor, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (puzzle_id, user_id) DO UPDATE
                SET tokens_remaining = EXCLUDED.tokens_remaining,
                    refill_anchor    = EXCLUDED.refill_anchor,
                    updated_at       = EXCLUDED.updated_at
            """

        private const val DELETE_BY_USER_SQL =
            "DELETE FROM puzzle_hint_usage WHERE user_id = ?"

        private const val LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtext(?))"
    }
}
