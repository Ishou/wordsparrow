package com.bliss.identity.domain.user

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test

class CapabilityTest {
    @Test
    fun `wire values are stable strings`() {
        assertThat(Capability.BILLING_SUBSCRIBE.wire).isEqualTo("billing:subscribe")
    }

    @Test
    fun `maintainer is granted billing subscribe`() {
        assertThat(capabilitiesFor(Role.MAINTAINER)).contains(Capability.BILLING_SUBSCRIBE)
    }

    @Test
    fun `player holds no capabilities`() {
        assertThat(capabilitiesFor(Role.PLAYER)).isEmpty()
    }
}
