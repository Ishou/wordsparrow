package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import com.bliss.billing.application.ports.ProviderSubscriptionRef
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.application.testdoubles.FixedClock
import com.bliss.billing.domain.SubscriptionStatus
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Duration
import java.util.UUID

class ReconcileSubscriptionsTest {
    private val provider = FakeBillingProvider()
    private val repository = FakeSubscriptionRepository()
    private val clock = FixedClock(FIXED_NOW)
    private val useCase = ReconcileSubscriptions(provider, repository, clock, agingThreshold = Duration.ofHours(24))

    private val userId = UUID.randomUUID()

    @Test
    fun `cancels a provider-active subscription with no local row`() =
        runTest {
            provider.activeSubscriptions.add(ProviderSubscriptionRef(externalRef = "sub_orphan", userId = userId))

            val summary = useCase.execute()

            assertThat(provider.cancelCalls).containsExactly("sub_orphan")
            assertThat(summary.orphansCancelled).isEqualTo(1)
        }

    @Test
    fun `does not cancel a provider-active subscription backed by a live local row`() =
        runTest {
            repository.save(subscription(userId = userId, externalRef = "sub_live", status = SubscriptionStatus.ACTIVE))
            provider.activeSubscriptions.add(ProviderSubscriptionRef(externalRef = "sub_live", userId = userId))

            val summary = useCase.execute()

            assertThat(provider.cancelCalls).hasSize(0)
            assertThat(summary.orphansCancelled).isEqualTo(0)
        }

    @Test
    fun `does not cancel a provider sub backed by a past-due local row`() =
        runTest {
            repository.save(subscription(userId = userId, externalRef = "sub_due", status = SubscriptionStatus.PAST_DUE))
            provider.activeSubscriptions.add(ProviderSubscriptionRef(externalRef = "sub_due", userId = userId))

            useCase.execute()

            assertThat(provider.cancelCalls).hasSize(0)
        }

    @Test
    fun `cancels a provider sub whose local row is pending cancellation`() =
        runTest {
            repository.save(
                subscription(userId = userId, externalRef = "sub_pending", status = SubscriptionStatus.PENDING_CANCELLATION),
            )
            provider.activeSubscriptions.add(ProviderSubscriptionRef(externalRef = "sub_pending", userId = userId))

            useCase.execute()

            assertThat(provider.cancelCalls).containsExactly("sub_pending")
        }

    @Test
    fun `cancels a provider sub whose local row is terminal`() =
        runTest {
            repository.save(subscription(userId = userId, externalRef = "sub_dead", status = SubscriptionStatus.CANCELED))
            provider.activeSubscriptions.add(ProviderSubscriptionRef(externalRef = "sub_dead", userId = userId))

            useCase.execute()

            assertThat(provider.cancelCalls).containsExactly("sub_dead")
        }

    @Test
    fun `alerts on a pending cancellation row older than the threshold`() =
        runTest {
            repository.saveStamp = FIXED_NOW.minus(Duration.ofHours(25))
            repository.save(
                subscription(userId = userId, externalRef = "sub_aging", status = SubscriptionStatus.PENDING_CANCELLATION),
            )

            val summary = useCase.execute()

            assertThat(summary.agingPendingCancellations).isEqualTo(1)
        }

    @Test
    fun `does not alert on a pending cancellation row within the threshold`() =
        runTest {
            repository.saveStamp = FIXED_NOW.minus(Duration.ofHours(1))
            repository.save(
                subscription(userId = userId, externalRef = "sub_fresh", status = SubscriptionStatus.PENDING_CANCELLATION),
            )

            val summary = useCase.execute()

            assertThat(summary.agingPendingCancellations).isEqualTo(0)
        }

    @Test
    fun `running twice has the same effect as running once`() =
        runTest {
            provider.activeSubscriptions.add(ProviderSubscriptionRef(externalRef = "sub_orphan", userId = userId))

            val first = useCase.execute()
            val second = useCase.execute()

            assertThat(first).isEqualTo(second)
            assertThat(provider.cancelCalls).containsExactly("sub_orphan", "sub_orphan")
        }
}
