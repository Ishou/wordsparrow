package com.bliss.billing.infrastructure.provider

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.bliss.billing.domain.SubscriptionStatus
import org.junit.jupiter.api.Test

class MollieStatusMappingTest {
    @Test
    fun `paid and authorized payments are active`() {
        assertThat(MollieStatusMapping.fromPaymentStatus("paid")).isEqualTo(SubscriptionStatus.ACTIVE)
        assertThat(MollieStatusMapping.fromPaymentStatus("authorized")).isEqualTo(SubscriptionStatus.ACTIVE)
    }

    @Test
    fun `failed and expired payments are expired`() {
        assertThat(MollieStatusMapping.fromPaymentStatus("failed")).isEqualTo(SubscriptionStatus.EXPIRED)
        assertThat(MollieStatusMapping.fromPaymentStatus("expired")).isEqualTo(SubscriptionStatus.EXPIRED)
    }

    @Test
    fun `canceled payment is canceled`() {
        assertThat(MollieStatusMapping.fromPaymentStatus("canceled")).isEqualTo(SubscriptionStatus.CANCELED)
    }

    @Test
    fun `open and pending payments are not yet actionable`() {
        assertThat(MollieStatusMapping.fromPaymentStatus("open")).isNull()
        assertThat(MollieStatusMapping.fromPaymentStatus("pending")).isNull()
        assertThat(MollieStatusMapping.fromPaymentStatus("unknown_future_status")).isNull()
    }

    @Test
    fun `subscription statuses map to the domain lifecycle`() {
        assertThat(MollieStatusMapping.fromSubscriptionStatus("active")).isEqualTo(SubscriptionStatus.ACTIVE)
        assertThat(MollieStatusMapping.fromSubscriptionStatus("suspended")).isEqualTo(SubscriptionStatus.PAST_DUE)
        assertThat(MollieStatusMapping.fromSubscriptionStatus("canceled")).isEqualTo(SubscriptionStatus.CANCELED)
        assertThat(MollieStatusMapping.fromSubscriptionStatus("completed")).isEqualTo(SubscriptionStatus.EXPIRED)
        assertThat(MollieStatusMapping.fromSubscriptionStatus("pending")).isNull()
    }
}
