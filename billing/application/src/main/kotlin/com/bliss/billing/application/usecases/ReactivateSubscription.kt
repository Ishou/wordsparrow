package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.EventIdGenerator
import com.bliss.billing.application.ports.SubscriptionChanged
import com.bliss.billing.application.ports.SubscriptionPublisher
import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.SubscriptionStatusView
import com.bliss.billing.domain.Tier
import java.time.Instant
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException

sealed interface ReactivateSubscriptionOutcome {
    /** Renewal resumed off the surviving mandate; the projection is `active` again, access unchanged through `periodEnd`. */
    data class Reactivated(
        val subscriptionView: SubscriptionStatusView,
    ) : ReactivateSubscriptionOutcome

    /** Nothing to resume — no scheduled non-renewal with a paid period still running; the route maps this to 404. */
    data object NotReactivatable : ReactivateSubscriptionOutcome
}

/** No-charge résiliation reversal for `POST /v1/subscription/reactivate`: for a `pending_cancellation` whose paid period is still running, create a fresh recurring subscription off the surviving mandate (deferred to `periodEnd`) and return the projection to `active` (CGV Art. 14.1). */
class ReactivateSubscription(
    private val provider: BillingProviderPort,
    private val repository: SubscriptionRepository,
    private val publisher: SubscriptionPublisher,
    private val clock: Clock,
    private val eventIds: EventIdGenerator,
) {
    suspend fun execute(userId: UUID): ReactivateSubscriptionOutcome {
        val subscription = repository.findByUserId(userId) ?: return ReactivateSubscriptionOutcome.NotReactivatable
        if (subscription.status != SubscriptionStatus.PENDING_CANCELLATION) return ReactivateSubscriptionOutcome.NotReactivatable
        val periodEnd = subscription.periodEnd ?: return ReactivateSubscriptionOutcome.NotReactivatable
        if (!periodEnd.isAfter(clock.now())) return ReactivateSubscriptionOutcome.NotReactivatable

        val newState = reactivateAtProvider(userId, subscription.externalRef, subscription.tier, periodEnd)

        val reactivated = subscription.reactivate(newState.externalRef, periodEnd)
        repository.save(reactivated)
        publisher.publish(
            SubscriptionChanged(
                eventId = eventIds.newEventId(),
                userId = reactivated.userId,
                tier = reactivated.tier,
                status = reactivated.status,
                periodEnd = reactivated.periodEnd,
                source = reactivated.source,
                changedAt = clock.now(),
            ),
        )
        return ReactivateSubscriptionOutcome.Reactivated(reactivated.statusView())
    }

    private suspend fun reactivateAtProvider(
        userId: UUID,
        currentExternalRef: String,
        tier: Tier,
        startDate: Instant,
    ) = try {
        provider.reactivate(userId, currentExternalRef, tier, startDate)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        throw ProviderUnavailable(e)
    }
}
