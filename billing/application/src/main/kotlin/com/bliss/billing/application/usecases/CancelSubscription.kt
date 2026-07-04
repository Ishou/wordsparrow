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
    /** Cancelled at the provider; the projection now reflects `canceled`. */
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

/** User-initiated cancel for `POST /v1/subscription/cancel`: cancel at the provider, reflect `canceled` locally (keep the row), and return the updated subscription view. */
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

        val cancelled = pending.confirmCanceled()
        repository.save(cancelled)
        publisher.publish(
            SubscriptionChanged(
                eventId = eventIds.newEventId(),
                userId = cancelled.userId,
                tier = cancelled.tier,
                status = cancelled.status,
                periodEnd = cancelled.periodEnd,
                source = cancelled.source,
                changedAt = clock.now(),
            ),
        )
        notifyCancellation(cancelled)
        return CancelSubscriptionOutcome.Cancelled(cancelled.statusView())
    }

    // Best-effort (ADR-0094, CGV Art. 14.1): the durable-medium confirmation must never turn a completed cancel into a failure, so send errors are logged and swallowed.
    private suspend fun notifyCancellation(cancelled: Subscription) {
        runCatching {
            notifier.confirmCancellation(
                CancellationConfirmation(cancelled.userId, cancelled.tier, clock.now(), cancelled.periodEnd),
            )
        }.onFailure { log.error("billing_email_failed kind=cancellation_confirmation user_id={}", cancelled.userId, it) }
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
