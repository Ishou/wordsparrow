package com.bliss.billing.domain

import assertk.assertThat
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import io.kotest.property.Arb
import io.kotest.property.arbitrary.stringPattern
import io.kotest.property.checkAll
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test
import java.time.Instant

class EntitlementTest {
    @Test
    fun `capabilitiesFor is total over every status and grants nothing yet`() =
        runBlocking {
            checkAll(Arb.stringPattern("[a-z]{1,12}")) { rawTier ->
                val tier = Tier.of(rawTier)
                SubscriptionStatus.entries.forEach { status ->
                    assertThat(capabilitiesFor(status, tier)).isEmpty()
                }
            }
        }

    @Test
    fun `of derives capabilities from status and tier`() {
        val end = Instant.parse("2026-07-29T00:00:00Z")
        val entitlement = Entitlement.of(SubscriptionStatus.ACTIVE, Tier.of("supporter"), end)
        assertThat(entitlement.tier).isEqualTo(Tier.of("supporter"))
        assertThat(entitlement.status).isEqualTo(SubscriptionStatus.ACTIVE)
        assertThat(entitlement.periodEnd).isEqualTo(end)
        assertThat(entitlement.capabilities).isEmpty()
    }

    @Test
    fun `of keeps a null period end`() {
        val entitlement = Entitlement.of(SubscriptionStatus.EXPIRED, Tier.free, null)
        assertThat(entitlement.periodEnd).isNull()
    }

    @Test
    fun `from projects a subscription`() {
        val subscription =
            Subscription(
                userId = java.util.UUID.randomUUID(),
                tier = Tier.free,
                status = SubscriptionStatus.ACTIVE,
                source = BillingSource.MOLLIE,
                externalRef = "sub_abc",
                periodEnd = null,
            )
        assertThat(Entitlement.from(subscription)).isEqualTo(subscription.entitlement())
        assertThat(Entitlement.from(subscription).capabilities).isEmpty()
    }
}
