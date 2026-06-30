package com.bliss.billing.domain

import java.time.Instant

/** The caller's subscription projection: tier, status, and current-period end. Carries no capabilities — identity owns authorization (ADR-0078 amendment). */
data class SubscriptionStatusView(
    val tier: Tier,
    val status: SubscriptionStatus,
    val periodEnd: Instant?,
) {
    companion object {
        fun from(subscription: Subscription): SubscriptionStatusView =
            SubscriptionStatusView(subscription.tier, subscription.status, subscription.periodEnd)
    }
}
