package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.EntitlementChanged
import com.bliss.billing.application.ports.EntitlementPublisher
import com.bliss.billing.application.ports.EventIdGenerator
import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.SubscriptionStatus
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException

sealed interface HandleUserDeletedOutcome {
    /** The provider subscription was cancelled and the local projection erased. */
    data object Cancelled : HandleUserDeletedOutcome

    /** The user had no subscription projection; nothing to cancel. */
    data object NoSubscription : HandleUserDeletedOutcome
}

/** Raised when the provider cancel fails; the projection is left in `pending_cancellation` with its `externalRef`, so a redelivery can retry (ADR-0078). */
class ProviderCancelFailed(
    cause: Throwable,
) : RuntimeException("Provider cancel failed: ${cause.message}", cause)

/** Deletion-cancellation invariant (ADR-0078). */
class HandleUserDeleted(
    private val provider: BillingProviderPort,
    private val repository: SubscriptionRepository,
    private val publisher: EntitlementPublisher,
    private val clock: Clock,
    private val eventIds: EventIdGenerator,
) {
    suspend fun execute(userId: UUID): HandleUserDeletedOutcome {
        val subscription = repository.findByUserId(userId) ?: return HandleUserDeletedOutcome.NoSubscription

        val pending =
            if (subscription.status == SubscriptionStatus.PENDING_CANCELLATION) {
                subscription
            } else {
                subscription.requestCancellation().also { repository.save(it) }
            }

        try {
            provider.cancel(pending.externalRef)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            throw ProviderCancelFailed(e)
        }

        val cancelled = pending.confirmCanceled()
        publisher.publish(
            EntitlementChanged(
                eventId = eventIds.newEventId(),
                userId = cancelled.userId,
                tier = cancelled.tier,
                status = cancelled.status,
                periodEnd = cancelled.periodEnd,
                source = cancelled.source,
                changedAt = clock.now(),
            ),
        )
        repository.delete(userId)
        return HandleUserDeletedOutcome.Cancelled
    }
}
