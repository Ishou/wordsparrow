package com.bliss.billing.infrastructure.persistence

import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.Subscription
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID
import javax.sql.DataSource

// JDBC is blocking; every method dispatches to IO. Enum columns store the domain `.wire` spelling, lowercase (ADR-0078).
class PostgresSubscriptionRepository(
    private val dataSource: DataSource,
    private val now: () -> Instant = Instant::now,
) : SubscriptionRepository {
    override suspend fun findByUserId(userId: UUID): Subscription? =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(SELECT_BY_USER_SQL).use { stmt ->
                    stmt.setObject(1, userId)
                    stmt.executeQuery().use { rs -> if (rs.next()) rs.toSubscription() else null }
                }
            }
        }

    override suspend fun findByExternalRef(externalRef: String): Subscription? =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(SELECT_BY_EXTERNAL_REF_SQL).use { stmt ->
                    stmt.setString(1, externalRef)
                    stmt.executeQuery().use { rs -> if (rs.next()) rs.toSubscription() else null }
                }
            }
        }

    override suspend fun save(subscription: Subscription) {
        withContext(Dispatchers.IO) {
            val ts = now().truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC)
            dataSource.connection.use { conn ->
                conn.prepareStatement(UPSERT_SQL).use { stmt ->
                    stmt.setObject(1, subscription.userId)
                    stmt.setString(2, subscription.tier.value)
                    stmt.setString(3, subscription.status.wire)
                    stmt.setString(4, subscription.source.wire)
                    stmt.setString(5, subscription.externalRef)
                    stmt.setObject(6, subscription.periodEnd?.truncatedTo(ChronoUnit.MICROS)?.atOffset(ZoneOffset.UTC))
                    stmt.setObject(7, ts)
                    stmt.setObject(8, ts)
                    stmt.executeUpdate()
                }
            }
        }
    }

    override suspend fun delete(userId: UUID) {
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(DELETE_SQL).use { stmt ->
                    stmt.setObject(1, userId)
                    stmt.executeUpdate()
                }
            }
        }
    }

    override suspend fun listActive(): List<Subscription> =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(SELECT_ACTIVE_SQL).use { stmt ->
                    stmt.executeQuery().use { rs ->
                        buildList { while (rs.next()) add(rs.toSubscription()) }
                    }
                }
            }
        }

    override suspend fun listPendingCancellationBefore(cutoff: Instant): List<Subscription> =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(SELECT_AGING_PENDING_SQL).use { stmt ->
                    stmt.setObject(1, cutoff.atOffset(ZoneOffset.UTC))
                    stmt.executeQuery().use { rs ->
                        buildList { while (rs.next()) add(rs.toSubscription()) }
                    }
                }
            }
        }

    private fun ResultSet.toSubscription(): Subscription =
        Subscription(
            userId = getObject("user_id", UUID::class.java),
            tier = Tier.of(getString("tier")),
            status = SubscriptionStatus.fromWire(getString("status")),
            source = BillingSource.fromWire(getString("source")),
            externalRef = getString("external_ref"),
            periodEnd = getObject("period_end", OffsetDateTime::class.java)?.toInstant(),
        )

    companion object {
        private const val COLUMNS = "user_id, tier, status, source, external_ref, period_end"
        private const val SELECT_BY_USER_SQL =
            "SELECT $COLUMNS FROM billing_subscriptions WHERE user_id = ?"
        private const val SELECT_BY_EXTERNAL_REF_SQL =
            "SELECT $COLUMNS FROM billing_subscriptions WHERE external_ref = ?"

        // listActive mirrors the projection's live set: every state except the terminal CANCELED/EXPIRED (ADR-0078 reconciliation backstop).
        private const val SELECT_ACTIVE_SQL =
            "SELECT $COLUMNS FROM billing_subscriptions WHERE status NOT IN ('canceled', 'expired')"

        // Aging deletion tombstones: pending_cancellation rows the backstop alerts on (ADR-0078, ADR-0032).
        private const val SELECT_AGING_PENDING_SQL =
            "SELECT $COLUMNS FROM billing_subscriptions WHERE status = 'pending_cancellation' AND updated_at < ?"
        private const val DELETE_SQL =
            "DELETE FROM billing_subscriptions WHERE user_id = ?"
        private const val UPSERT_SQL =
            "INSERT INTO billing_subscriptions " +
                "(user_id, tier, status, source, external_ref, period_end, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
                "ON CONFLICT (user_id) DO UPDATE SET " +
                "tier = EXCLUDED.tier, status = EXCLUDED.status, source = EXCLUDED.source, " +
                "external_ref = EXCLUDED.external_ref, period_end = EXCLUDED.period_end, updated_at = EXCLUDED.updated_at"
    }
}
