package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.Subscription
import com.bliss.billing.domain.SubscriptionStatus
import java.util.UUID

/** In-memory SubscriptionRepository for application-layer tests (no infrastructure dependency). */
class FakeSubscriptionRepository : SubscriptionRepository {
    private val byUserId = LinkedHashMap<UUID, Subscription>()

    override suspend fun findByUserId(userId: UUID): Subscription? = byUserId[userId]

    override suspend fun findByExternalRef(externalRef: String): Subscription? =
        byUserId.values.firstOrNull { it.externalRef == externalRef }

    override suspend fun save(subscription: Subscription) {
        byUserId[subscription.userId] = subscription
    }

    override suspend fun delete(userId: UUID) {
        byUserId.remove(userId)
    }

    override suspend fun listActive(): List<Subscription> =
        byUserId.values.filter { it.status != SubscriptionStatus.CANCELED && it.status != SubscriptionStatus.EXPIRED }
}
