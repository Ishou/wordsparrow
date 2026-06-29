package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.EntitlementChanged
import com.bliss.billing.application.ports.EntitlementPublisher
import com.bliss.billing.application.ports.EventIdGenerator
import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.Entitlement
import com.bliss.billing.domain.SubscriptionStatus
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException

sealed interface CancelSubscriptionOutcome {
    /** Cancelled at the provider; the projection now reflects `canceled`. */
    data class Cancelled(
        val entitlement: Entitlement,
    ) : CancelSubscriptionOutcome

    /** The caller has nothing cancellable; the route maps this to 404. */
    data object NoActiveSubscription : CancelSubscriptionOutcome
}

/** Raised when the provider is unreachable; the route maps it to 503 and the projection stays `pending_cancellation` for a later retry. */
class ProviderUnavailable(
    cause: Throwable,
) : RuntimeException("Provider unavailable: ${cause.message}", cause)

/** User-initiated cancel for `POST /v1/subscription/cancel`: cancel at the provider, reflect `canceled` locally (keep the row), and return the updated entitlement. */
class CancelSubscription(
    private val provider: BillingProviderPort,
    private val repository: SubscriptionRepository,
    private val publisher: EntitlementPublisher,
    private val clock: Clock,
    private val eventIds: EventIdGenerator,
) {
    suspend fun execute(userId: UUID): CancelSubscriptionOutcome {
        val subscription = repository.findByUserId(userId) ?: return CancelSubscriptionOutcome.NoActiveSubscription
        if (subscription.status !in CANCELLABLE) return CancelSubscriptionOutcome.NoActiveSubscription

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
            throw ProviderUnavailable(e)
        }

        val cancelled = pending.confirmCanceled()
        repository.save(cancelled)
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
        return CancelSubscriptionOutcome.Cancelled(cancelled.entitlement())
    }

    private companion object {
        val CANCELLABLE =
            setOf(
                SubscriptionStatus.ACTIVE,
                SubscriptionStatus.PAST_DUE,
                SubscriptionStatus.PENDING_CANCELLATION,
            )
    }
}
