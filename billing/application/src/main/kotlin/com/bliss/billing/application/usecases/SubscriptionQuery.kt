package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.SubscriptionStatusView
import com.bliss.billing.domain.Tier
import java.util.UUID

/** Resolves the caller's own subscription status for `GET /v1/subscription`; a never-subscribed user falls back to the free projection (ADR-0078). */
class SubscriptionQuery(
    private val repository: SubscriptionRepository,
) {
    suspend fun execute(userId: UUID): SubscriptionStatusView = repository.findByUserId(userId)?.statusView() ?: FREE

    private companion object {
        // No stored subscription means "never subscribed"; EXPIRED is the no-current-period terminal.
        val FREE: SubscriptionStatusView = SubscriptionStatusView(Tier.free, SubscriptionStatus.EXPIRED, null)
    }
}
