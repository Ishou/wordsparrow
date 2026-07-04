package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.EventIdGenerator
import com.bliss.billing.application.ports.SubscriptionChanged
import com.bliss.billing.application.ports.SubscriptionPublisher
import com.bliss.billing.application.ports.SubscriptionRepository
import org.slf4j.LoggerFactory

/** Counter from one expiry-sweep pass; the worker logs it as the run summary. */
data class ExpireLapsedCancellationsSummary(
    val expired: Int,
)

/** Scheduled-sweep backstop that ends a résiliation at `periodEnd`: identity maps status alone to entitlement (no periodEnd), so a lapsed `PENDING_CANCELLATION` must transition to `EXPIRED` and emit `SubscriptionChanged` or the user keeps premium forever (CGV Art. 14.1, ADR-0078). Idempotent and safe to repeat. */
class ExpireLapsedCancellations(
    private val repository: SubscriptionRepository,
    private val publisher: SubscriptionPublisher,
    private val clock: Clock,
    private val eventIds: EventIdGenerator,
) {
    private val log = LoggerFactory.getLogger(ExpireLapsedCancellations::class.java)

    suspend fun execute(): ExpireLapsedCancellationsSummary {
        val now = clock.now()
        val lapsed = repository.listPendingCancellationExpiredAt(now)
        for (subscription in lapsed) {
            val expired = subscription.expire()
            repository.save(expired)
            publisher.publish(
                SubscriptionChanged(
                    eventId = eventIds.newEventId(),
                    userId = expired.userId,
                    tier = expired.tier,
                    status = expired.status,
                    periodEnd = expired.periodEnd,
                    source = expired.source,
                    changedAt = now,
                ),
            )
        }
        log.info("event=billing_expire_lapsed_cancellations_done expired={}", lapsed.size)
        return ExpireLapsedCancellationsSummary(lapsed.size)
    }
}
