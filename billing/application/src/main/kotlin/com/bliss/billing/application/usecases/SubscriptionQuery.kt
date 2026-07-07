package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.SubscriptionStatusView
import java.util.UUID

/** Resolves the caller's own subscription status for `GET /v1/subscription` (ADR-0078); null means never subscribed — the API edge projects that to the "none" status rather than a fake lapsed state. */
class SubscriptionQuery(
    private val repository: SubscriptionRepository,
) {
    suspend fun execute(userId: UUID): SubscriptionStatusView? = repository.findByUserId(userId)?.statusView()
}
