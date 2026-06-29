package com.bliss.billing.domain

import assertk.assertThat
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class TierTest {
    @Test
    fun `free constant is the lowercase free tier`() {
        assertThat(Tier.free.value).isEqualTo("free")
    }

    @Test
    fun `of accepts a lowercase non-blank tier`() {
        assertThat(Tier.of("supporter").value).isEqualTo("supporter")
    }

    @Test
    fun `of trims surrounding whitespace`() {
        assertThat(Tier.of("  premium  ").value).isEqualTo("premium")
    }

    @Test
    fun `toString returns the raw value`() {
        assertThat(Tier.of("supporter").toString()).isEqualTo("supporter")
    }

    @Test
    fun `of rejects a blank tier`() {
        assertThrows<IllegalArgumentException> { Tier.of("   ") }
    }

    @Test
    fun `of rejects an uppercase tier`() {
        assertThrows<IllegalArgumentException> { Tier.of("Premium") }
    }
}
