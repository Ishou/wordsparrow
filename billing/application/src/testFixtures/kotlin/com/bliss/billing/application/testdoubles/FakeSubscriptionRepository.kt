package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.Subscription
import com.bliss.billing.domain.SubscriptionStatus
import java.time.Instant
import java.util.UUID

/** In-memory SubscriptionRepository for application-layer tests (no infrastructure dependency). */
class FakeSubscriptionRepository : SubscriptionRepository {
    private val byUserId = LinkedHashMap<UUID, Subscription>()
    private val updatedAt = LinkedHashMap<UUID, Instant>()

    /** updated_at stamp applied on the next [save]; tests advance it to age a row past the backstop threshold. */
    var saveStamp: Instant = Instant.EPOCH

    /** Test seam: run before [compareAndSetFromPendingCancellation] reads the row, letting a test simulate a concurrent writer winning the race. */
    var beforeCompareAndSet: (suspend () -> Unit)? = null

    override suspend fun findByUserId(userId: UUID): Subscription? = byUserId[userId]

    override suspend fun findByExternalRef(externalRef: String): Subscription? =
        byUserId.values.firstOrNull { it.externalRef == externalRef }

    override suspend fun save(subscription: Subscription) {
        byUserId[subscription.userId] = subscription
        updatedAt[subscription.userId] = saveStamp
    }

    override suspend fun compareAndSetFromPendingCancellation(next: Subscription): Boolean {
        beforeCompareAndSet?.invoke()
        val current = byUserId[next.userId] ?: return false
        if (current.status != SubscriptionStatus.PENDING_CANCELLATION) return false
        byUserId[next.userId] = next
        updatedAt[next.userId] = saveStamp
        return true
    }

    override suspend fun delete(userId: UUID) {
        byUserId.remove(userId)
        updatedAt.remove(userId)
    }

    override suspend fun listActive(): List<Subscription> =
        byUserId.values.filter { it.status != SubscriptionStatus.CANCELED && it.status != SubscriptionStatus.EXPIRED }

    override suspend fun listPendingCancellationBefore(cutoff: Instant): List<Subscription> =
        byUserId.values.filter {
            it.status == SubscriptionStatus.PENDING_CANCELLATION &&
                (updatedAt[it.userId] ?: Instant.EPOCH).isBefore(cutoff)
        }

    override suspend fun listPendingCancellationExpiredAt(now: Instant): List<Subscription> =
        byUserId.values.filter {
            it.status == SubscriptionStatus.PENDING_CANCELLATION &&
                it.periodEnd?.isAfter(now) == false
        }
}
