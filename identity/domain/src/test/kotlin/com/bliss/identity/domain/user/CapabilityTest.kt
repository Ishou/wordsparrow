package com.bliss.identity.domain.user

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.doesNotContain
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test

class CapabilityTest {
    @Test
    fun `wire values are stable strings`() {
        assertThat(Capability.HINT.wire).isEqualTo("hint")
        assertThat(Capability.CONTRIBUER.wire).isEqualTo("contribuer")
        assertThat(Capability.BILLING_SUBSCRIBE.wire).isEqualTo("billing:subscribe")
        assertThat(Capability.GRILLES_ALL.wire).isEqualTo("grilles:all")
        assertThat(Capability.GRILLES_GENERATE.wire).isEqualTo("grilles:generate")
        assertThat(Capability.MULTIPLAYER_HOST_UNLIMITED.wire).isEqualTo("multiplayer:host-unlimited")
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

    @Test
    fun `free tier adds no capability to a player`() {
        assertThat(capabilitiesFor(Role.PLAYER, SubscriptionTier.FREE))
            .containsExactlyInAnyOrder(Capability.HINT)
    }

    @Test
    fun `subscriber tier adds grilles all generate and unlimited hosting to a player`() {
        assertThat(capabilitiesFor(Role.PLAYER, SubscriptionTier.SUBSCRIBER))
            .containsExactlyInAnyOrder(
                Capability.HINT,
                Capability.GRILLES_ALL,
                Capability.GRILLES_GENERATE,
                Capability.MULTIPLAYER_HOST_UNLIMITED,
            )
        assertThat(capabilitiesFor(Role.PLAYER, SubscriptionTier.SUBSCRIBER).map { it.wire })
            .containsExactlyInAnyOrder("hint", "grilles:all", "grilles:generate", "multiplayer:host-unlimited")
    }

    @Test
    fun `subscriber tier stacks onto a maintainer's role capabilities`() {
        assertThat(capabilitiesFor(Role.MAINTAINER, SubscriptionTier.SUBSCRIBER))
            .containsExactlyInAnyOrder(
                Capability.HINT,
                Capability.CONTRIBUER,
                Capability.BILLING_SUBSCRIBE,
                Capability.GRILLES_ALL,
                Capability.GRILLES_GENERATE,
                Capability.MULTIPLAYER_HOST_UNLIMITED,
            )
    }

    @Test
    fun `tier capabilities derive independently of role`() {
        assertThat(capabilitiesFor(null, SubscriptionTier.SUBSCRIBER))
            .containsExactlyInAnyOrder(
                Capability.GRILLES_ALL,
                Capability.GRILLES_GENERATE,
                Capability.MULTIPLAYER_HOST_UNLIMITED,
            )
    }

    @Test
    fun `multiplayer host unlimited is subscriber-only, not role-derived`() {
        assertThat(capabilitiesFor(Role.PLAYER)).doesNotContain(Capability.MULTIPLAYER_HOST_UNLIMITED)
        assertThat(capabilitiesFor(Role.MAINTAINER)).doesNotContain(Capability.MULTIPLAYER_HOST_UNLIMITED)
        assertThat(capabilitiesFor(Role.PLAYER, SubscriptionTier.FREE)).doesNotContain(Capability.MULTIPLAYER_HOST_UNLIMITED)
        assertThat(capabilitiesFor(null)).doesNotContain(Capability.MULTIPLAYER_HOST_UNLIMITED)
    }
}
