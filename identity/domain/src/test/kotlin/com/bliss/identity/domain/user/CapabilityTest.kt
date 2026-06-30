package com.bliss.identity.domain.user

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test

class CapabilityTest {
    @Test
    fun `wire values are stable strings`() {
        assertThat(Capability.HINT.wire).isEqualTo("hint")
        assertThat(Capability.CONTRIBUER.wire).isEqualTo("contribuer")
        assertThat(Capability.BILLING_SUBSCRIBE.wire).isEqualTo("billing:subscribe")
    }

    @Test
    fun `guest holds no capabilities`() {
        assertThat(capabilitiesFor(null)).isEmpty()
    }

    @Test
    fun `player holds only hint`() {
        assertThat(capabilitiesFor(Role.PLAYER)).containsExactlyInAnyOrder(Capability.HINT)
        assertThat(capabilitiesFor(Role.PLAYER).map { it.wire }).containsExactlyInAnyOrder("hint")
    }

    @Test
    fun `maintainer holds hint contribuer and billing subscribe`() {
        assertThat(capabilitiesFor(Role.MAINTAINER))
            .containsExactlyInAnyOrder(Capability.HINT, Capability.CONTRIBUER, Capability.BILLING_SUBSCRIBE)
        assertThat(capabilitiesFor(Role.MAINTAINER).map { it.wire })
            .containsExactlyInAnyOrder("hint", "contribuer", "billing:subscribe")
    }
}
