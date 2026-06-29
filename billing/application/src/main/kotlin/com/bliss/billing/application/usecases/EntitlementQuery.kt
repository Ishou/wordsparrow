package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.Entitlement
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import java.util.UUID

/** Resolves the caller's entitlement for `GET /v1/entitlement`; a never-subscribed user falls back to the free, capability-less projection (ADR-0078). */
class EntitlementQuery(
    private val repository: SubscriptionRepository,
) {
    suspend fun execute(userId: UUID): Entitlement = repository.findByUserId(userId)?.entitlement() ?: FREE

    private companion object {
        // No domain status means "never subscribed"; EXPIRED is the no-current-period terminal, and capabilities are empty for every status anyway.
        val FREE: Entitlement = Entitlement.of(SubscriptionStatus.EXPIRED, Tier.free, null)
    }
}
