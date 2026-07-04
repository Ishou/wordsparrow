package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.ContractConfirmation
import com.bliss.billing.application.ports.ContractConfirmationNotifier
import com.bliss.billing.application.ports.EventIdGenerator
import com.bliss.billing.application.ports.ProcessedEventLedger
import com.bliss.billing.application.ports.ProviderSubscriptionState
import com.bliss.billing.application.ports.RenewalReceipt
import com.bliss.billing.application.ports.SubscriptionChanged
import com.bliss.billing.application.ports.SubscriptionPublisher
import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.Subscription
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.SubscriptionStatusView
import org.slf4j.LoggerFactory

sealed interface IngestOutcome {
    /** The state was applied and a SubscriptionChanged published. */
    data class Applied(
        val subscriptionView: SubscriptionStatusView,
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
    private val publisher: SubscriptionPublisher,
    private val ledger: ProcessedEventLedger,
    private val clock: Clock,
    private val eventIds: EventIdGenerator,
    private val notifier: ContractConfirmationNotifier = NoOpContractConfirmationNotifier(),
) {
    private val log = LoggerFactory.getLogger(IngestProviderEvent::class.java)

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
        if (isRenewalCharge(stored, next)) notifyRenewal(next, state.cadence)
        return IngestOutcome.Applied(next.statusView())
    }

    private suspend fun createFromFirstPayment(
        eventRef: String,
        state: ProviderSubscriptionState,
    ): IngestOutcome {
        if (state.status != SubscriptionStatus.ACTIVE) return IngestOutcome.Ignored
        val providerState = provider.createSubscription(state.userId, eventRef, state.tier)
        val created = providerState.toNewSubscription()
        repository.save(created)
        // Ledger written after save: a Mollie or save failure leaves the key unclaimed so a webhook retry can re-enter.
        if (!ledger.recordIfAbsent(eventRef)) return IngestOutcome.Unchanged
        emit(created)
        notifyContract(created, providerState.cadence)
        return IngestOutcome.Applied(created.statusView())
    }

    private fun isRenewalCharge(
        stored: Subscription,
        next: Subscription,
    ): Boolean =
        next.status == SubscriptionStatus.ACTIVE &&
            (stored.status != SubscriptionStatus.ACTIVE || periodEndAdvanced(stored.periodEnd, next.periodEnd))

    private fun periodEndAdvanced(
        before: java.time.Instant?,
        after: java.time.Instant?,
    ): Boolean = after != null && (before == null || after.isAfter(before))

    // Best-effort (ADR-0094): a legally-mandated email must never break webhook idempotency, so send failures are logged and swallowed.
    private suspend fun notifyContract(
        subscription: Subscription,
        cadence: Cadence?,
    ) {
        val resolved = cadence ?: return logMissingCadence("contract_confirmation", subscription.userId)
        runCatching {
            notifier.confirmContractFormation(
                ContractConfirmation(subscription.userId, subscription.tier, resolved, clock.now(), subscription.periodEnd),
            )
        }.onFailure { log.error("billing_email_failed kind=contract_confirmation user_id={}", subscription.userId, it) }
    }

    private suspend fun notifyRenewal(
        subscription: Subscription,
        cadence: Cadence?,
    ) {
        val resolved = cadence ?: return logMissingCadence("renewal_receipt", subscription.userId)
        runCatching {
            notifier.confirmRenewal(
                RenewalReceipt(subscription.userId, subscription.tier, resolved, clock.now(), subscription.periodEnd),
            )
        }.onFailure { log.error("billing_email_failed kind=renewal_receipt user_id={}", subscription.userId, it) }
    }

    private fun logMissingCadence(
        kind: String,
        userId: java.util.UUID,
    ) {
        log.warn("billing_email_skipped_no_cadence kind={} user_id={}", kind, userId)
    }

    private suspend fun emit(subscription: Subscription) {
        publisher.publish(
            SubscriptionChanged(
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
            // A scheduled non-renewal is resumed only via reactivate() (explicit user intent + mandate re-validation) — a stray webhook on the stale ref must stay a no-op, not resurrect it through the domain's raw PENDING_CANCELLATION -> ACTIVE transition.
            status == SubscriptionStatus.PENDING_CANCELLATION && state.status == SubscriptionStatus.ACTIVE -> this
            status.canTransitionTo(state.status) ->
                copy(status = status.transition(state.status), tier = state.tier, periodEnd = state.periodEnd)
            else -> this
        }
}
