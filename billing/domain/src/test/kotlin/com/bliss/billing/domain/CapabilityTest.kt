package com.bliss.billing.domain

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.matches
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class CapabilityTest {
    @Test
    fun `every wire id is kebab case`() {
        Capability.entries.forEach { capability ->
            assertThat(capability.wire).matches(Regex("[a-z]+(-[a-z]+)*"))
        }
    }

    @Test
    fun `wire ids are unique`() {
        assertThat(
            Capability.entries
                .map { it.wire }
                .toSet()
                .size,
        ).isEqualTo(Capability.entries.size)
    }

    @Test
    fun `wire roundtrips for every capability`() {
        Capability.entries.forEach { capability ->
            assertThat(Capability.fromWire(capability.wire)).isEqualTo(capability)
        }
    }

    @Test
    fun `wire spellings match the seeded vocabulary`() {
        assertThat(Capability.DAILY_ARCHIVE.wire).isEqualTo("daily-archive")
        assertThat(Capability.NO_ADS.wire).isEqualTo("no-ads")
        assertThat(Capability.UNLIMITED_HINTS.wire).isEqualTo("unlimited-hints")
        assertThat(Capability.EXTRA_DAILY_PUZZLES.wire).isEqualTo("extra-daily-puzzles")
    }

    @Test
    fun `fromWire rejects an unregistered identifier`() {
        assertThrows<IllegalArgumentException> { Capability.fromWire("teleport") }
    }
}
