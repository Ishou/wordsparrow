package com.bliss.billing.worker

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.isEqualTo
import com.bliss.billing.application.ports.ProviderSubscriptionRef
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.application.testdoubles.FixedClock
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import java.util.UUID

class MainTest {
    private val provider = FakeBillingProvider()
    private val repository = FakeSubscriptionRepository()
    private val clock = FixedClock(Instant.parse("2026-06-29T12:00:00Z"))

    @Test
    fun `reconcileAndExit cancels orphans and returns success`() {
        provider.activeSubscriptions.add(ProviderSubscriptionRef(externalRef = "sub_orphan", userId = UUID.randomUUID()))

        val exit = reconcileAndExit(provider, repository, clock, Duration.ofHours(24))

        assertThat(exit).isEqualTo(0)
        assertThat(provider.cancelCalls).containsExactly("sub_orphan")
    }

    @Test
    fun `reconcileAndExit returns success on an empty provider`() {
        val exit = reconcileAndExit(provider, repository, clock, Duration.ofHours(24))

        assertThat(exit).isEqualTo(0)
    }
}
