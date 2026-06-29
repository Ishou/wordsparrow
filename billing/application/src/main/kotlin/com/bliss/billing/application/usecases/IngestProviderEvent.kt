package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.EntitlementChanged
import com.bliss.billing.application.ports.EntitlementPublisher
import com.bliss.billing.application.ports.EventIdGenerator
import com.bliss.billing.application.ports.ProviderSubscriptionState
import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.Entitlement
import com.bliss.billing.domain.Subscription

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

/** Authenticates a webhook by re-fetching authoritative provider state, projects it, and publishes the resulting entitlement (ADR-0078). */
class IngestProviderEvent(
    private val provider: BillingProviderPort,
    private val repository: SubscriptionRepository,
    private val publisher: EntitlementPublisher,
    private val clock: Clock,
    private val eventIds: EventIdGenerator,
) {
    suspend fun execute(externalRef: String): IngestOutcome {
        val state = provider.fetchByReference(externalRef) ?: return IngestOutcome.Ignored
        val stored = repository.findByExternalRef(externalRef)
        // Re-fetch returns the provider's CURRENT state, so an out-of-order event can never regress newer state; equality makes redelivery a no-op.
        val next = stored?.advanceTo(state) ?: state.toNewSubscription()
        if (next == stored) return IngestOutcome.Unchanged
        repository.save(next)
        publisher.publish(
            EntitlementChanged(
                eventId = eventIds.newEventId(),
                userId = next.userId,
                tier = next.tier,
                status = next.status,
                periodEnd = next.periodEnd,
                source = next.source,
                changedAt = clock.now(),
            ),
        )
        return IngestOutcome.Applied(next.entitlement())
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
