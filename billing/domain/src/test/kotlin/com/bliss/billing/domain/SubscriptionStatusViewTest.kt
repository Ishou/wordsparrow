package com.bliss.billing.domain

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class SubscriptionStatusViewTest {
    @Test
    fun `from projects a subscription tier status and period end`() {
        val end = Instant.parse("2026-07-29T00:00:00Z")
        val subscription =
            Subscription(
                userId = UUID.randomUUID(),
                tier = Tier.of("supporter"),
                status = SubscriptionStatus.ACTIVE,
                source = BillingSource.MOLLIE,
                externalRef = "sub_abc",
                periodEnd = end,
            )

        val view = SubscriptionStatusView.from(subscription)

        assertThat(view.tier).isEqualTo(Tier.of("supporter"))
        assertThat(view.status).isEqualTo(SubscriptionStatus.ACTIVE)
        assertThat(view.periodEnd).isEqualTo(end)
    }

    @Test
    fun `from keeps a null period end`() {
        val subscription =
            Subscription(
                userId = UUID.randomUUID(),
                tier = Tier.free,
                status = SubscriptionStatus.EXPIRED,
                source = BillingSource.MOLLIE,
                externalRef = "sub_abc",
                periodEnd = null,
            )

        assertThat(SubscriptionStatusView.from(subscription).periodEnd).isNull()
    }
}
