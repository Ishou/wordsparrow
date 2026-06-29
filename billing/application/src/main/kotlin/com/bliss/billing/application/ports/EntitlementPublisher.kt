package com.bliss.billing.application.ports

import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import java.time.Instant
import java.util.UUID

/** EntitlementChanged event (asyncapi `wordsparrow.user.entitlement-changed`). `eventId` is a UUID v7 so consumers dedupe under at-least-once delivery (ADR-0078). */
data class EntitlementChanged(
    val eventId: UUID,
    val userId: UUID,
    val tier: Tier,
    val status: SubscriptionStatus,
    val periodEnd: Instant?,
    val source: BillingSource,
    val changedAt: Instant,
)

/** Outbound port publishing entitlement transitions for grid/game/identity to cache and enforce server-side (ADR-0078). */
fun interface EntitlementPublisher {
    suspend fun publish(event: EntitlementChanged)
}
