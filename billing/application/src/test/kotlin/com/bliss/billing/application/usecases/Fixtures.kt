package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.ProviderSubscriptionState
import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.Subscription
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import java.time.Instant
import java.util.UUID

internal val FIXED_NOW: Instant = Instant.parse("2026-06-29T12:00:00Z")
internal val PERIOD_END: Instant = Instant.parse("2026-07-29T00:00:00Z")

internal fun subscription(
    userId: UUID = UUID.randomUUID(),
    tier: Tier = Tier.of("supporter"),
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
    externalRef: String = "sub_test",
    periodEnd: Instant? = PERIOD_END,
): Subscription =
    Subscription(
        userId = userId,
        tier = tier,
        status = status,
        source = BillingSource.MOLLIE,
        externalRef = externalRef,
        periodEnd = periodEnd,
    )

internal fun providerState(
    userId: UUID,
    externalRef: String = "sub_test",
    tier: Tier = Tier.of("supporter"),
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
    periodEnd: Instant? = PERIOD_END,
): ProviderSubscriptionState =
    ProviderSubscriptionState(
        externalRef = externalRef,
        userId = userId,
        tier = tier,
        status = status,
        source = BillingSource.MOLLIE,
        periodEnd = periodEnd,
    )
