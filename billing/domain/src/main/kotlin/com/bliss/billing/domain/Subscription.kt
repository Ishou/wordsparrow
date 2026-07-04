package com.bliss.billing.domain

import java.time.Instant
import java.util.UUID

/** Subscription aggregate. `externalRef` is the opaque provider reference and is never dropped before a confirmed cancel (ADR-0078). */
data class Subscription(
    val userId: UUID,
    val tier: Tier,
    val status: SubscriptionStatus,
    val source: BillingSource,
    val externalRef: String,
    val periodEnd: Instant?,
) {
    fun requestCancellation(): Subscription = copy(status = status.transition(SubscriptionStatus.PENDING_CANCELLATION))

    fun confirmCanceled(): Subscription =
        if (status == SubscriptionStatus.CANCELED) {
            this
        } else {
            copy(status = status.transition(SubscriptionStatus.CANCELED))
        }

    fun markPastDue(): Subscription = copy(status = status.transition(SubscriptionStatus.PAST_DUE))

    fun expire(): Subscription = copy(status = status.transition(SubscriptionStatus.EXPIRED))

    fun renew(newPeriodEnd: Instant): Subscription =
        when (status) {
            SubscriptionStatus.ACTIVE -> copy(periodEnd = newPeriodEnd)
            // Only a lapsed billing state resumes on renewal; a scheduled non-renewal is resumed via reactivate(), never by a stray provider event on a stale ref.
            SubscriptionStatus.PAST_DUE, SubscriptionStatus.EXPIRED ->
                copy(status = status.transition(SubscriptionStatus.ACTIVE), periodEnd = newPeriodEnd)
            else -> throw IllegalArgumentException("Cannot renew from $status")
        }

    /** Reprendre a scheduled non-renewal: bind the new provider subscription and return to ACTIVE, keeping access to [newPeriodEnd] (CGV Art. 14.1). */
    fun reactivate(
        newExternalRef: String,
        newPeriodEnd: Instant,
    ): Subscription =
        copy(
            status = status.transition(SubscriptionStatus.ACTIVE),
            externalRef = newExternalRef,
            periodEnd = newPeriodEnd,
        )

    /** Still confers access, so a fresh subscribe must be blocked: any live status, except a scheduled non-renewal whose paid period has already lapsed. */
    fun blocksNewSubscription(now: Instant): Boolean =
        status.isLive() &&
            (status != SubscriptionStatus.PENDING_CANCELLATION || periodEnd?.isAfter(now) == true)

    fun statusView(): SubscriptionStatusView = SubscriptionStatusView.from(this)
}
