package com.bliss.billing.application.ports

import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import java.time.Instant
import java.util.UUID

/** SubscriptionChanged event (asyncapi `wordsparrow.user.subscription-changed`). `eventId` is a UUID v7 so consumers dedupe under at-least-once delivery (ADR-0078). */
data class SubscriptionChanged(
    val eventId: UUID,
    val userId: UUID,
    val tier: Tier,
    val status: SubscriptionStatus,
    val periodEnd: Instant?,
    val source: BillingSource,
    val changedAt: Instant,
)

/** Outbound port publishing subscription transitions for identity to consume and derive capabilities from (ADR-0078 amendment). */
fun interface SubscriptionPublisher {
    suspend fun publish(event: SubscriptionChanged)
}
