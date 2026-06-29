package com.bliss.billing.infrastructure.provider

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import org.junit.jupiter.api.Test

class MollieReferenceTest {
    @Test
    fun `a bare payment id decodes to a payment reference`() {
        val ref = MollieReference.decode("tr_WDqYK6vllg")
        assertThat(ref).isInstanceOf(MollieReference.Payment::class)
        assertThat((ref as MollieReference.Payment).paymentId).isEqualTo("tr_WDqYK6vllg")
    }

    @Test
    fun `a composite encodes and decodes to a subscription reference`() {
        val encoded = MollieReference.subscription("cust_8wmqcHMN4U", "sub_rVKGtNd6s6")
        assertThat(encoded).isEqualTo("cust_8wmqcHMN4U:sub_rVKGtNd6s6")

        val ref = MollieReference.decode(encoded)
        assertThat(ref).isInstanceOf(MollieReference.Subscription::class)
        ref as MollieReference.Subscription
        assertThat(ref.customerId).isEqualTo("cust_8wmqcHMN4U")
        assertThat(ref.subscriptionId).isEqualTo("sub_rVKGtNd6s6")
    }
}
