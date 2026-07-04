package com.bliss.billing.domain

import assertk.assertThat
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test
import kotlin.random.Random

class VatBreakdownTest {
    @Test
    fun `splits the two-euro monthly price at twenty percent`() {
        val breakdown = VatBreakdown.ofTtc(200)

        assertThat(breakdown.ttcMinorUnits).isEqualTo(200)
        assertThat(breakdown.vatMinorUnits).isEqualTo(33)
        assertThat(breakdown.htMinorUnits).isEqualTo(167)
        assertThat(breakdown.ratePercent).isEqualTo(20)
    }

    @Test
    fun `splits the twenty-euro yearly price at twenty percent`() {
        val breakdown = VatBreakdown.ofTtc(2000)

        assertThat(breakdown.vatMinorUnits).isEqualTo(333)
        assertThat(breakdown.htMinorUnits).isEqualTo(1667)
    }

    @Test
    fun `ht plus vat always reconstitutes the ttc exactly`() {
        repeat(10_000) {
            val ttc = Random.nextLong(0L, 100_000_000L)
            val rate = Random.nextInt(0, 101)
            val breakdown = VatBreakdown.ofTtc(ttc, rate)
            assertThat(breakdown.htMinorUnits + breakdown.vatMinorUnits).isEqualTo(ttc)
        }
    }
}
