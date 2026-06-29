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
        if (status == SubscriptionStatus.ACTIVE) {
            copy(periodEnd = newPeriodEnd)
        } else {
            copy(status = status.transition(SubscriptionStatus.ACTIVE), periodEnd = newPeriodEnd)
        }

    fun entitlement(): Entitlement = Entitlement.from(this)
}
