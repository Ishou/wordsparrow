package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.CancellationConfirmation
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.ContractConfirmationNotifier
import com.bliss.billing.application.ports.EventIdGenerator
import com.bliss.billing.application.ports.SubscriptionChanged
import com.bliss.billing.application.ports.SubscriptionPublisher
import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.Subscription
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.SubscriptionStatusView
import org.slf4j.LoggerFactory
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException

sealed interface CancelSubscriptionOutcome {
    /** Renewal stopped at the provider; the projection stays `pending_cancellation` so access runs to `periodEnd` (CGV Art. 14.1). */
    data class Cancelled(
        val subscriptionView: SubscriptionStatusView,
    ) : CancelSubscriptionOutcome

    /** The caller has nothing cancellable; the route maps this to 404. */
    data object NoActiveSubscription : CancelSubscriptionOutcome
}

/** Raised when the provider is unreachable; the route maps it to 503 and the projection stays `pending_cancellation` for a later retry. */
class ProviderUnavailable(
    cause: Throwable,
) : RuntimeException("Provider unavailable: ${cause.message}", cause)

/** User-initiated résiliation for `POST /v1/subscription/cancel`: stop renewal at the provider but keep the entitlement `pending_cancellation` until `periodEnd`, and return the updated subscription view (CGV Art. 14.1). Account deletion, not this, is what tombstones a subscription to `canceled`. */
class CancelSubscription(
    private val provider: BillingProviderPort,
    private val repository: SubscriptionRepository,
    private val publisher: SubscriptionPublisher,
    private val clock: Clock,
    private val eventIds: EventIdGenerator,
    private val notifier: ContractConfirmationNotifier = NoOpContractConfirmationNotifier(),
) {
    private val log = LoggerFactory.getLogger(CancelSubscription::class.java)

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

        // Résiliation is scheduled non-renewal: the row stays PENDING_CANCELLATION (never CANCELED) so entitlement runs to periodEnd.
        publisher.publish(
            SubscriptionChanged(
                eventId = eventIds.newEventId(),
                userId = pending.userId,
                tier = pending.tier,
                status = pending.status,
                periodEnd = pending.periodEnd,
                source = pending.source,
                changedAt = clock.now(),
            ),
        )
        notifyCancellation(pending)
        return CancelSubscriptionOutcome.Cancelled(pending.statusView())
    }

    // Best-effort (ADR-0094, CGV Art. 14.1): the durable-medium confirmation must never turn a completed résiliation into a failure, so send errors are logged and swallowed.
    private suspend fun notifyCancellation(pending: Subscription) {
        runCatching {
            notifier.confirmCancellation(
                CancellationConfirmation(pending.userId, pending.tier, clock.now(), pending.periodEnd),
            )
        }.onFailure { log.error("billing_email_failed kind=cancellation_confirmation user_id={}", pending.userId, it) }
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
