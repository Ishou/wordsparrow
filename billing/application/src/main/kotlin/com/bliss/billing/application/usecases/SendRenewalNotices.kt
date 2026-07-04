package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.ContractConfirmationNotifier
import com.bliss.billing.application.ports.PreRenewalNotice
import com.bliss.billing.application.ports.RenewalNoticeLedger
import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.ChatelWindow
import com.bliss.billing.domain.RenewalNoticeKind
import com.bliss.billing.domain.Subscription
import com.bliss.billing.domain.SubscriptionStatus
import org.slf4j.LoggerFactory
import java.time.Instant

/** Counters from one pre-renewal pass; the worker logs them as its run summary. */
data class RenewalNoticeSummary(
    val annualInWindow: Int,
    val noticesSent: Int,
    val alreadyNotified: Int,
)

/** Chatel pre-renewal scheduler (art. L215-1, ADR-0094 §3): finds annual subscriptions inside the notice window and sends each its durable-medium notice once. Provider stays system-of-record for cadence + échéance (ADR-0078). */
class SendRenewalNotices(
    private val subscriptions: SubscriptionRepository,
    private val provider: BillingProviderPort,
    private val notifier: ContractConfirmationNotifier,
    private val ledger: RenewalNoticeLedger,
    private val clock: Clock,
    private val window: ChatelWindow = ChatelWindow.DEFAULT,
) {
    private val log = LoggerFactory.getLogger(SendRenewalNotices::class.java)

    suspend fun execute(): RenewalNoticeSummary {
        val now = clock.now()
        var annualInWindow = 0
        var noticesSent = 0
        var alreadyNotified = 0
        for (subscription in subscriptions.listActive()) {
            if (subscription.status != SubscriptionStatus.ACTIVE) continue
            val candidate = eligibleAnnual(subscription, now) ?: continue
            annualInWindow++
            if (ledger.hasSent(subscription.userId, candidate.periodEnd, RenewalNoticeKind.CHATEL_PRE_RENEWAL)) {
                alreadyNotified++
                continue
            }
            notifier.sendChatelPreRenewalNotice(candidate)
            ledger.record(subscription.userId, subscription.externalRef, candidate.periodEnd, RenewalNoticeKind.CHATEL_PRE_RENEWAL, now)
            noticesSent++
        }
        log.info(
            "event=send_renewal_notices_summary annual_in_window={} notices_sent={} already_notified={}",
            annualInWindow,
            noticesSent,
            alreadyNotified,
        )
        return RenewalNoticeSummary(annualInWindow, noticesSent, alreadyNotified)
    }

    // Cadence + authoritative échéance come from the provider, not the lean local projection (which stores neither).
    private suspend fun eligibleAnnual(
        subscription: Subscription,
        now: Instant,
    ): PreRenewalNotice? {
        val state = provider.fetchByReference(subscription.externalRef) ?: return null
        if (state.cadence != Cadence.YEARLY) return null
        val periodEnd = state.periodEnd ?: return null
        if (!window.shouldSend(now, periodEnd)) return null
        return PreRenewalNotice(subscription.userId, subscription.tier, Cadence.YEARLY, periodEnd)
    }
}
