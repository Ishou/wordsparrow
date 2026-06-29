package com.bliss.billing.domain

import java.time.Instant

/** Gate-agnostic resolution of (status, tier) to capabilities. Deliberately grants nothing: the free/paid offer is deferred (ADR-0078). */
fun capabilitiesFor(
    status: SubscriptionStatus,
    tier: Tier,
): Set<Capability> = emptySet()

/** The caller's entitlement projection: what consuming contexts gate on (capabilities), never the raw tier (ADR-0078). */
data class Entitlement(
    val tier: Tier,
    val status: SubscriptionStatus,
    val periodEnd: Instant?,
    val capabilities: Set<Capability>,
) {
    companion object {
        fun of(
            status: SubscriptionStatus,
            tier: Tier,
            periodEnd: Instant?,
        ): Entitlement = Entitlement(tier, status, periodEnd, capabilitiesFor(status, tier))

        fun from(subscription: Subscription): Entitlement = of(subscription.status, subscription.tier, subscription.periodEnd)
    }
}
