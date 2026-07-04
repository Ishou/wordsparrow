package com.bliss.billing.infrastructure.persistence

import com.bliss.billing.application.ports.RenewalNoticeLedger
import com.bliss.billing.domain.RenewalNoticeKind
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID
import javax.sql.DataSource

// JDBC is blocking; every method dispatches to IO. Timestamps truncated to micros so the period_end equality lookup matches the stored value; ON CONFLICT DO NOTHING makes record idempotent under the unique index.
class PostgresRenewalNoticeLedger(
    private val dataSource: DataSource,
) : RenewalNoticeLedger {
    override suspend fun hasSent(
        userId: UUID,
        periodEnd: Instant,
        kind: RenewalNoticeKind,
    ): Boolean =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(SELECT_SQL).use { stmt ->
                    stmt.setObject(1, userId)
                    stmt.setObject(2, periodEnd.truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC))
                    stmt.setString(3, kind.wire)
                    stmt.executeQuery().use { rs -> rs.next() }
                }
            }
        }

    override suspend fun record(
        userId: UUID,
        externalRef: String,
        periodEnd: Instant,
        kind: RenewalNoticeKind,
        sentAt: Instant,
    ) {
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(INSERT_SQL).use { stmt ->
                    stmt.setObject(1, userId)
                    stmt.setString(2, externalRef)
                    stmt.setObject(3, periodEnd.truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC))
                    stmt.setString(4, kind.wire)
                    stmt.setObject(5, sentAt.truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC))
                    stmt.executeUpdate()
                }
            }
        }
    }

    companion object {
        private const val SELECT_SQL =
            "SELECT 1 FROM billing_renewal_notices WHERE user_id = ? AND period_end = ? AND notice_kind = ?"
        private const val INSERT_SQL =
            "INSERT INTO billing_renewal_notices (user_id, external_ref, period_end, notice_kind, sent_at) " +
                "VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, period_end, notice_kind) DO NOTHING"
    }
}
