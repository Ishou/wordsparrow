package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.ProviderSubscriptionRef
import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.Subscription
import com.bliss.billing.domain.SubscriptionStatus
import org.slf4j.LoggerFactory
import java.time.Duration

/** Counters from one reconciliation pass; the worker logs them as its run summary (ADR-0078 backstop). */
data class ReconciliationSummary(
    val providerActiveCount: Int,
    val orphansCancelled: Int,
    val agingPendingCancellations: Int,
)

/** Event-independent backstop for the deletion-cancellation invariant (ADR-0078): a CronJob pass, idempotent and safe to repeat. */
class ReconcileSubscriptions(
    private val provider: BillingProviderPort,
    private val repository: SubscriptionRepository,
    private val clock: Clock,
    private val agingThreshold: Duration = Duration.ofHours(24),
) {
    private val log = LoggerFactory.getLogger(ReconcileSubscriptions::class.java)

    suspend fun execute(): ReconciliationSummary {
        val providerActive = provider.listActiveSubscriptions()
        val orphansCancelled = providerActive.count { cancelIfOrphaned(it) }
        val aging = alertAgingPendingCancellations()
        log.info(
            "event=reconcile_subscriptions_summary provider_active={} orphans_cancelled={} aging_pending_cancellations={}",
            providerActive.size,
            orphansCancelled,
            aging.size,
        )
        return ReconciliationSummary(providerActive.size, orphansCancelled, aging.size)
    }

    private suspend fun cancelIfOrphaned(ref: ProviderSubscriptionRef): Boolean {
        val local = repository.findByExternalRef(ref.externalRef)
        if (local != null && local.status.hasLiveIntent()) return false
        provider.cancel(ref.externalRef)
        log.warn(
            "event=reconcile_orphan_cancelled external_ref={} user_id={} local_status={}",
            ref.externalRef,
            ref.userId,
            local?.status,
        )
        return true
    }

    private suspend fun alertAgingPendingCancellations(): List<Subscription> {
        val aging = repository.listPendingCancellationBefore(clock.now().minus(agingThreshold))
        for (row in aging) {
            log.warn(
                "event=reconcile_aging_pending_cancellation user_id={} external_ref={} threshold_hours={} note=\"a deleted user may still be billable\"",
                row.userId,
                row.externalRef,
                agingThreshold.toHours(),
            )
        }
        return aging
    }

    // A live local intent is an entitlement still meant to bill; PENDING_CANCELLATION is the deletion tombstone, not a live intent (ADR-0078).
    private fun SubscriptionStatus.hasLiveIntent(): Boolean = this == SubscriptionStatus.ACTIVE || this == SubscriptionStatus.PAST_DUE
}
