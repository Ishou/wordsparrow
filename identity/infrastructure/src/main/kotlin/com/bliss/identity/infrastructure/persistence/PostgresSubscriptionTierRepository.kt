package com.bliss.identity.infrastructure.persistence

import com.bliss.identity.application.ports.SubscriptionTierRepository
import com.bliss.identity.domain.user.SubscriptionTier
import com.bliss.identity.domain.user.UserId
import com.bliss.identity.domain.user.UserSubscription
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID
import javax.sql.DataSource

/**
 * Postgres-backed [SubscriptionTierRepository]. JDBC is blocking; every method wraps
 * its calls in `withContext(Dispatchers.IO)` to keep the suspend port honest.
 */
class PostgresSubscriptionTierRepository(
    private val dataSource: DataSource,
) : SubscriptionTierRepository {
    override suspend fun find(userId: UserId): UserSubscription? =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(SELECT_SQL).use { stmt ->
                    stmt.setObject(1, userId.value)
                    stmt.executeQuery().use { rs -> if (rs.next()) rs.toSubscription() else null }
                }
            }
        }

    override suspend fun upsert(subscription: UserSubscription): Unit =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(UPSERT_SQL).use { stmt ->
                    stmt.setObject(1, subscription.userId.value)
                    stmt.setString(2, subscription.tier.wire)
                    stmt.setObject(3, subscription.changedAt.truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC))
                    stmt.executeUpdate()
                }
            }
        }

    private fun ResultSet.toSubscription(): UserSubscription =
        UserSubscription(
            userId = UserId(getObject("user_id", UUID::class.java)),
            tier = SubscriptionTier.fromWire(getString("tier")),
            changedAt = getObject("changed_at", OffsetDateTime::class.java).toInstant(),
        )

    companion object {
        private const val SELECT_SQL =
            "SELECT user_id, tier, changed_at FROM identity_user_subscription WHERE user_id = ?"
        private const val UPSERT_SQL =
            "INSERT INTO identity_user_subscription (user_id, tier, changed_at) VALUES (?, ?, ?) " +
                "ON CONFLICT (user_id) DO UPDATE SET tier = excluded.tier, changed_at = excluded.changed_at"
    }
}
