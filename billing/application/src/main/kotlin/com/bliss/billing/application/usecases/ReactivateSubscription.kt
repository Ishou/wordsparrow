package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.EventIdGenerator
import com.bliss.billing.application.ports.NoValidMandateException
import com.bliss.billing.application.ports.ProviderSubscriptionState
import com.bliss.billing.application.ports.ReactivationCadenceUnresolvableException
import com.bliss.billing.application.ports.SubscriptionChanged
import com.bliss.billing.application.ports.SubscriptionPublisher
import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.SubscriptionStatusView
import com.bliss.billing.domain.Tier
import org.slf4j.LoggerFactory
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

    /** No reusable payment mandate on file, so no no-charge resume is possible; the caller must subscribe afresh — the route maps this to 409, never a retry-forever 503. */
    data object NoPaymentMethod : ReactivateSubscriptionOutcome

    /** The old subscription's billing cadence can't be recovered, so resuming would risk a silent annual→monthly downgrade; the caller must subscribe afresh — the route maps this to 409, never a retry-forever 503. */
    data object CadenceUnresolvable : ReactivateSubscriptionOutcome
}

/** No-charge résiliation reversal for `POST /v1/subscription/reactivate`: for a `pending_cancellation` whose paid period is still running, create a fresh recurring subscription off the surviving mandate (deferred to `periodEnd`) and return the projection to `active` (CGV Art. 14.1). */
class ReactivateSubscription(
    private val provider: BillingProviderPort,
    private val repository: SubscriptionRepository,
    private val publisher: SubscriptionPublisher,
    private val clock: Clock,
    private val eventIds: EventIdGenerator,
) {
    private val log = LoggerFactory.getLogger(ReactivateSubscription::class.java)

    suspend fun execute(userId: UUID): ReactivateSubscriptionOutcome {
        val subscription = repository.findByUserId(userId) ?: return ReactivateSubscriptionOutcome.NotReactivatable
        if (subscription.status != SubscriptionStatus.PENDING_CANCELLATION) return ReactivateSubscriptionOutcome.NotReactivatable
        val periodEnd = subscription.periodEnd ?: return ReactivateSubscriptionOutcome.NotReactivatable
        if (!periodEnd.isAfter(clock.now())) return ReactivateSubscriptionOutcome.NotReactivatable

        val newState =
            when (val result = reactivateAtProvider(userId, subscription.externalRef, subscription.tier, periodEnd)) {
                is ProviderReactivation.Created -> result.state
                ProviderReactivation.NoMandate -> return ReactivateSubscriptionOutcome.NoPaymentMethod
                ProviderReactivation.CadenceUnresolvable -> return ReactivateSubscriptionOutcome.CadenceUnresolvable
            }

        val reactivated = subscription.reactivate(newState.externalRef, periodEnd)
        // Compare-and-set: only bind the fresh Mollie subscription if the row is still pending_cancellation, so two concurrent reactivates (or the expiry sweep) can't leave an orphan double-charging.
        if (!repository.compareAndSetFromPendingCancellation(reactivated)) {
            cancelOrphan(newState.externalRef)
            return idempotentOutcome(userId)
        }
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

    // A concurrent winner already reactivated (row is active again) or the period lapsed to expired; reflect the persisted truth idempotently rather than the losing attempt's state.
    private suspend fun idempotentOutcome(userId: UUID): ReactivateSubscriptionOutcome {
        val current = repository.findByUserId(userId)
        return if (current?.status == SubscriptionStatus.ACTIVE) {
            ReactivateSubscriptionOutcome.Reactivated(current.statusView())
        } else {
            ReactivateSubscriptionOutcome.NotReactivatable
        }
    }

    // Best-effort: the orphan sub's ref is absent from the local projection, so the ADR-0078 reconciliation backstop cancels it if this call fails.
    private suspend fun cancelOrphan(externalRef: String) {
        runCatching { provider.cancel(externalRef) }
            .onFailure { log.error("event=reactivate_orphan_cancel_failed external_ref={}", externalRef, it) }
    }

    private suspend fun reactivateAtProvider(
        userId: UUID,
        currentExternalRef: String,
        tier: Tier,
        startDate: Instant,
    ): ProviderReactivation =
        try {
            ProviderReactivation.Created(provider.reactivate(userId, currentExternalRef, tier, startDate))
        } catch (e: CancellationException) {
            throw e
        } catch (e: NoValidMandateException) {
            ProviderReactivation.NoMandate
        } catch (e: ReactivationCadenceUnresolvableException) {
            ProviderReactivation.CadenceUnresolvable
        } catch (e: Exception) {
            throw ProviderUnavailable(e)
        }

    private sealed interface ProviderReactivation {
        data class Created(
            val state: ProviderSubscriptionState,
        ) : ProviderReactivation

        data object NoMandate : ProviderReactivation

        data object CadenceUnresolvable : ProviderReactivation
    }
}
