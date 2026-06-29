package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.EntitlementChanged
import com.bliss.billing.application.ports.EntitlementPublisher
import com.bliss.billing.application.ports.EventIdGenerator
import com.bliss.billing.application.ports.ProcessedEventLedger
import com.bliss.billing.application.ports.ProviderSubscriptionState
import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.Entitlement
import com.bliss.billing.domain.Subscription
import com.bliss.billing.domain.SubscriptionStatus

sealed interface IngestOutcome {
    /** The state was applied and an EntitlementChanged published. */
    data class Applied(
        val entitlement: Entitlement,
    ) : IngestOutcome

    /** Authoritative state matched the stored projection; no change, no re-publish (idempotent redelivery). */
    data object Unchanged : IngestOutcome

    /** The provider has no such resource, or the transition would be illegal/stale; the callback is dropped. */
    data object Ignored : IngestOutcome
}

/** Authenticates a webhook by re-fetching authoritative provider state, then either creates the recurring subscription from a paid first payment or advances an existing one; idempotent under at-least-once delivery (ADR-0078). */
class IngestProviderEvent(
    private val provider: BillingProviderPort,
    private val repository: SubscriptionRepository,
    private val publisher: EntitlementPublisher,
    private val ledger: ProcessedEventLedger,
    private val clock: Clock,
    private val eventIds: EventIdGenerator,
) {
    suspend fun execute(externalRef: String): IngestOutcome {
        val state = provider.fetchByReference(externalRef) ?: return IngestOutcome.Ignored
        repository.findByExternalRef(state.externalRef)?.let { return advance(it, state) }
        // A live projection for the user means the recurring subscription already exists, so this unmatched event is a redelivered first-payment webhook.
        if (repository.findByUserId(state.userId)?.status?.isLive() == true) return IngestOutcome.Unchanged
        return createFromFirstPayment(externalRef, state)
    }

    private suspend fun advance(
        stored: Subscription,
        state: ProviderSubscriptionState,
    ): IngestOutcome {
        val next = stored.advanceTo(state)
        if (next == stored) return IngestOutcome.Unchanged
        repository.save(next)
        emit(next)
        return IngestOutcome.Applied(next.entitlement())
    }

    private suspend fun createFromFirstPayment(
        eventRef: String,
        state: ProviderSubscriptionState,
    ): IngestOutcome {
        if (state.status != SubscriptionStatus.ACTIVE) return IngestOutcome.Ignored
        val created = provider.createSubscription(state.userId, eventRef, state.tier).toNewSubscription()
        repository.save(created)
        // Ledger written after save: a Mollie or save failure leaves the key unclaimed so a webhook retry can re-enter.
        if (!ledger.recordIfAbsent(eventRef)) return IngestOutcome.Unchanged
        emit(created)
        return IngestOutcome.Applied(created.entitlement())
    }

    private suspend fun emit(subscription: Subscription) {
        publisher.publish(
            EntitlementChanged(
                eventId = eventIds.newEventId(),
                userId = subscription.userId,
                tier = subscription.tier,
                status = subscription.status,
                periodEnd = subscription.periodEnd,
                source = subscription.source,
                changedAt = clock.now(),
            ),
        )
    }

    private fun ProviderSubscriptionState.toNewSubscription(): Subscription =
        Subscription(
            userId = userId,
            tier = tier,
            status = status,
            source = source,
            externalRef = externalRef,
            periodEnd = periodEnd,
        )

    /** Move the stored projection toward the authoritative status, refusing illegal transitions (returns the unchanged projection so a stale event is a no-op). */
    private fun Subscription.advanceTo(state: ProviderSubscriptionState): Subscription =
        when {
            state.status == status -> copy(tier = state.tier, periodEnd = state.periodEnd)
            status.canTransitionTo(state.status) ->
                copy(status = status.transition(state.status), tier = state.tier, periodEnd = state.periodEnd)
            else -> this
        }
}
