package com.bliss.billing.worker

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import com.bliss.billing.application.ports.ProviderSubscriptionRef
import com.bliss.billing.application.ports.ProviderSubscriptionState
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.application.testdoubles.FixedClock
import com.bliss.billing.application.testdoubles.InMemoryRenewalNoticeLedger
import com.bliss.billing.application.testdoubles.RecordingContractConfirmationNotifier
import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.ChatelWindow
import com.bliss.billing.domain.Subscription
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import kotlinx.coroutines.test.runTest
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

    @Test
    fun `sendRenewalNoticesAndExit sends the notice for an in-window annual sub and returns success`() =
        runTest {
            val userId = UUID.randomUUID()
            val periodEnd = clock.now().plus(Duration.ofDays(38))
            repository.save(
                Subscription(
                    userId = userId,
                    tier = Tier.of("supporter"),
                    status = SubscriptionStatus.ACTIVE,
                    source = BillingSource.MOLLIE,
                    externalRef = "sub_annual",
                    periodEnd = periodEnd,
                ),
            )
            provider.seed(
                ProviderSubscriptionState(
                    externalRef = "sub_annual",
                    userId = userId,
                    tier = Tier.of("supporter"),
                    status = SubscriptionStatus.ACTIVE,
                    source = BillingSource.MOLLIE,
                    periodEnd = periodEnd,
                    cadence = Cadence.YEARLY,
                ),
            )
            val notifier = RecordingContractConfirmationNotifier()

            val exit =
                sendRenewalNoticesAndExit(repository, provider, notifier, InMemoryRenewalNoticeLedger(), clock, ChatelWindow.DEFAULT)

            assertThat(exit).isEqualTo(0)
            assertThat(notifier.preRenewalNotices).hasSize(1)
        }

    @Test
    fun `sendRenewalNoticesAndExit returns success with nothing to send`() =
        runTest {
            val exit =
                sendRenewalNoticesAndExit(
                    repository,
                    provider,
                    RecordingContractConfirmationNotifier(),
                    InMemoryRenewalNoticeLedger(),
                    clock,
                    ChatelWindow.DEFAULT,
                )

            assertThat(exit).isEqualTo(0)
        }
}
