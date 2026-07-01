package com.bliss.billing.domain

import assertk.assertThat
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class CadenceTest {
    @Test
    fun `monthly and yearly carry their wire spellings`() {
        assertThat(Cadence.MONTHLY.wire).isEqualTo("monthly")
        assertThat(Cadence.YEARLY.wire).isEqualTo("yearly")
    }

    @Test
    fun `default cadence is monthly`() {
        assertThat(Cadence.default).isEqualTo(Cadence.MONTHLY)
    }

    @Test
    fun `fromWire resolves the monthly spelling`() {
        assertThat(Cadence.fromWire("monthly")).isEqualTo(Cadence.MONTHLY)
    }

    @Test
    fun `fromWire resolves the yearly spelling`() {
        assertThat(Cadence.fromWire("yearly")).isEqualTo(Cadence.YEARLY)
    }

    @Test
    fun `fromWire trims surrounding whitespace`() {
        assertThat(Cadence.fromWire("  yearly  ")).isEqualTo(Cadence.YEARLY)
    }

    @Test
    fun `fromWire rejects an unknown cadence`() {
        assertThrows<IllegalArgumentException> { Cadence.fromWire("weekly") }
    }

    @Test
    fun `fromWire rejects an uppercase cadence`() {
        assertThrows<IllegalArgumentException> { Cadence.fromWire("MONTHLY") }
    }

    @Test
    fun `toString returns the wire spelling`() {
        assertThat(Cadence.YEARLY.toString()).isEqualTo("yearly")
    }
}
