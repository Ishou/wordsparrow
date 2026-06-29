package com.bliss.billing.domain

import assertk.assertThat
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class BillingSourceTest {
    @Test
    fun `mollie is the only source for now`() {
        assertThat(BillingSource.entries.map { it.wire }).isEqualTo(listOf("mollie"))
    }

    @Test
    fun `wire roundtrips for every source`() {
        BillingSource.entries.forEach { source ->
            assertThat(BillingSource.fromWire(source.wire)).isEqualTo(source)
        }
    }

    @Test
    fun `fromWire rejects an unknown source`() {
        assertThrows<IllegalArgumentException> { BillingSource.fromWire("play") }
    }
}
