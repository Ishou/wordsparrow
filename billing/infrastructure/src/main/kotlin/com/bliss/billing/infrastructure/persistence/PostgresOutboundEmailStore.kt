package com.bliss.billing.infrastructure.persistence

import com.bliss.billing.application.ports.OutboundEmailRecord
import com.bliss.billing.application.ports.OutboundEmailStore
import com.bliss.billing.domain.OutboundEmailKind
import com.bliss.billing.domain.OutboundEmailStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID
import javax.sql.DataSource

// JDBC is blocking; every method dispatches to IO. Timestamps are truncated to micros to match Postgres TIMESTAMPTZ precision. enqueue relies on the dedupe_key unique index (ON CONFLICT DO NOTHING) for idempotency across webhook redeliveries.
class PostgresOutboundEmailStore(
    private val dataSource: DataSource,
) : OutboundEmailStore {
    override suspend fun enqueue(record: OutboundEmailRecord): Boolean =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(INSERT_SQL).use { stmt ->
                    stmt.setObject(1, record.id)
                    stmt.setObject(2, record.userId)
                    stmt.setString(3, record.kind.wire)
                    stmt.setString(4, record.dedupeKey)
                    stmt.setString(5, record.subject)
                    stmt.setString(6, record.htmlBody)
                    stmt.setString(7, record.textBody)
                    stmt.setString(8, record.status.wire)
                    stmt.setInt(9, record.attempts)
                    stmt.setObject(10, toOffset(record.nextAttemptAt))
                    stmt.setString(11, record.lastError)
                    stmt.setObject(12, toOffset(record.createdAt))
                    stmt.setObject(13, toOffset(record.sentAt))
                    stmt.executeUpdate() > 0
                }
            }
        }

    override suspend fun claimDue(
        now: Instant,
        limit: Int,
    ): List<OutboundEmailRecord> =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(CLAIM_DUE_SQL).use { stmt ->
                    stmt.setObject(1, toOffset(now))
                    stmt.setInt(2, limit)
                    stmt.setObject(3, toOffset(now.plus(CLAIM_LEASE)))
                    stmt.executeQuery().use { rs ->
                        buildList {
                            while (rs.next()) add(rs.toRecord())
                        }
                    }
                }
            }
        }

    override suspend fun claim(
        id: UUID,
        now: Instant,
    ): Boolean =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(CLAIM_ONE_SQL).use { stmt ->
                    stmt.setObject(1, toOffset(now.plus(CLAIM_LEASE)))
                    stmt.setObject(2, id)
                    stmt.setObject(3, toOffset(now))
                    stmt.executeUpdate() > 0
                }
            }
        }

    override suspend fun pendingBacklog(): Int =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(BACKLOG_SQL).use { stmt ->
                    stmt.executeQuery().use { rs ->
                        if (rs.next()) rs.getInt(1) else 0
                    }
                }
            }
        }

    override suspend fun markSent(
        id: UUID,
        at: Instant,
    ) {
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(MARK_SENT_SQL).use { stmt ->
                    stmt.setObject(1, toOffset(at))
                    stmt.setObject(2, id)
                    stmt.executeUpdate()
                }
            }
        }
    }

    override suspend fun recordFailure(
        id: UUID,
        attempts: Int,
        nextAttemptAt: Instant,
        error: String,
    ) {
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(RECORD_FAILURE_SQL).use { stmt ->
                    stmt.setInt(1, attempts)
                    stmt.setObject(2, toOffset(nextAttemptAt))
                    stmt.setString(3, error)
                    stmt.setObject(4, id)
                    stmt.executeUpdate()
                }
            }
        }
    }

    override suspend fun markFailed(
        id: UUID,
        error: String,
    ) {
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(MARK_FAILED_SQL).use { stmt ->
                    stmt.setString(1, error)
                    stmt.setObject(2, id)
                    stmt.executeUpdate()
                }
            }
        }
    }

    private fun ResultSet.toRecord(): OutboundEmailRecord =
        OutboundEmailRecord(
            id = getObject("id", UUID::class.java),
            userId = getObject("user_id", UUID::class.java),
            kind = OutboundEmailKind.fromWire(getString("kind")),
            dedupeKey = getString("dedupe_key"),
            subject = getString("subject"),
            htmlBody = getString("html_body"),
            textBody = getString("text_body"),
            status = OutboundEmailStatus.fromWire(getString("status")),
            attempts = getInt("attempts"),
            nextAttemptAt = toInstant(getObject("next_attempt_at", OffsetDateTime::class.java)),
            lastError = getString("last_error"),
            createdAt = toInstant(getObject("created_at", OffsetDateTime::class.java))!!,
            sentAt = toInstant(getObject("sent_at", OffsetDateTime::class.java)),
        )

    private fun toOffset(instant: Instant?): OffsetDateTime? = instant?.truncatedTo(ChronoUnit.MICROS)?.atOffset(ZoneOffset.UTC)

    private fun toInstant(value: OffsetDateTime?): Instant? = value?.toInstant()

    companion object {
        private const val COLUMNS =
            "id, user_id, kind, dedupe_key, subject, html_body, text_body, status, attempts, next_attempt_at, last_error, created_at, sent_at"
        private const val INSERT_SQL =
            "INSERT INTO billing_outbound_emails ($COLUMNS) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (dedupe_key) DO NOTHING"

        // FOR UPDATE SKIP LOCKED + a next_attempt_at lease is the canonical Postgres claim: the CTE locks a batch no concurrent drain can see, then the UPDATE leases them forward so the same rows are not re-claimed until markSent/recordFailure/markFailed or the lease lapses.
        private val CLAIM_LEASE: java.time.Duration = java.time.Duration.ofMinutes(5)
        private const val CLAIM_DUE_SQL =
            "WITH due AS (" +
                "SELECT id FROM billing_outbound_emails " +
                "WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY next_attempt_at ASC LIMIT ? " +
                "FOR UPDATE SKIP LOCKED) " +
                "UPDATE billing_outbound_emails o SET next_attempt_at = ? FROM due WHERE o.id = due.id " +
                "RETURNING o.*"
        private const val CLAIM_ONE_SQL =
            "UPDATE billing_outbound_emails SET next_attempt_at = ? " +
                "WHERE id = ? AND status = 'pending' AND next_attempt_at <= ?"
        private const val BACKLOG_SQL =
            "SELECT count(*) FROM billing_outbound_emails WHERE status = 'pending'"
        private const val MARK_SENT_SQL =
            "UPDATE billing_outbound_emails SET status = 'sent', sent_at = ?, next_attempt_at = NULL WHERE id = ?"
        private const val RECORD_FAILURE_SQL =
            "UPDATE billing_outbound_emails SET status = 'pending', attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?"
        private const val MARK_FAILED_SQL =
            "UPDATE billing_outbound_emails SET status = 'failed', next_attempt_at = NULL, last_error = ? WHERE id = ?"
    }
}
