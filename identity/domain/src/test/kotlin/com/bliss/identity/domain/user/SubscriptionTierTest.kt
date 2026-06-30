package com.bliss.identity.domain.user

import assertk.assertThat
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test

class SubscriptionTierTest {
    @Test
    fun `wire values are stable strings`() {
        assertThat(SubscriptionTier.FREE.wire).isEqualTo("free")
        assertThat(SubscriptionTier.SUBSCRIBER.wire).isEqualTo("subscriber")
    }

    @Test
    fun `fromWire maps known tiers`() {
        assertThat(SubscriptionTier.fromWire("free")).isEqualTo(SubscriptionTier.FREE)
        assertThat(SubscriptionTier.fromWire("subscriber")).isEqualTo(SubscriptionTier.SUBSCRIBER)
    }

    @Test
    fun `fromWire collapses an unknown tier to free`() {
        assertThat(SubscriptionTier.fromWire("premium")).isEqualTo(SubscriptionTier.FREE)
        assertThat(SubscriptionTier.fromWire("")).isEqualTo(SubscriptionTier.FREE)
    }
}
