package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNotNull
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.application.testdoubles.FixedClock
import com.bliss.billing.application.testdoubles.RecordingContractConfirmationNotifier
import com.bliss.billing.application.testdoubles.RecordingSubscriptionPublisher
import com.bliss.billing.application.testdoubles.SequentialEventIdGenerator
import com.bliss.billing.domain.SubscriptionStatus
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.util.UUID

class CancelSubscriptionTest {
    private val provider = FakeBillingProvider()
    private val repository = FakeSubscriptionRepository()
    private val publisher = RecordingSubscriptionPublisher()
    private val clock = FixedClock(FIXED_NOW)
    private val eventIds = SequentialEventIdGenerator()
    private val notifier = RecordingContractConfirmationNotifier()
    private val useCase = CancelSubscription(provider, repository, publisher, clock, eventIds, notifier)

    private val userId = UUID.randomUUID()

    @Test
    fun `stops renewal at the provider and leaves the row pending cancellation until period end`() =
        runTest {
            repository.save(subscription(userId = userId, externalRef = "sub_1"))

            val outcome = useCase.execute(userId)

            assertThat(outcome).isInstanceOf(CancelSubscriptionOutcome.Cancelled::class)
            val cancelled = outcome as CancelSubscriptionOutcome.Cancelled
            assertThat(cancelled.subscriptionView.status).isEqualTo(SubscriptionStatus.PENDING_CANCELLATION)
            assertThat(provider.cancelCalls).isEqualTo(listOf("sub_1"))
            val survivor = repository.findByUserId(userId)
            assertThat(survivor).isNotNull()
            assertThat(survivor!!.status).isEqualTo(SubscriptionStatus.PENDING_CANCELLATION)
            assertThat(publisher.events.single().status).isEqualTo(SubscriptionStatus.PENDING_CANCELLATION)
        }

    @Test
    fun `never tombstones the subscription to canceled - deletion owns that transition`() =
        runTest {
            repository.save(subscription(userId = userId, externalRef = "sub_1"))

            useCase.execute(userId)

            assertThat(repository.findByUserId(userId)!!.status).isEqualTo(SubscriptionStatus.PENDING_CANCELLATION)
        }

    @Test
    fun `reports no active subscription when nothing is stored`() =
        runTest {
            val outcome = useCase.execute(userId)

            assertThat(outcome).isEqualTo(CancelSubscriptionOutcome.NoActiveSubscription)
            assertThat(provider.cancelCalls).hasSize(0)
        }

    @Test
    fun `reports no active subscription for an already canceled row`() =
        runTest {
            repository.save(subscription(userId = userId, externalRef = "sub_1", status = SubscriptionStatus.CANCELED))

            val outcome = useCase.execute(userId)

            assertThat(outcome).isEqualTo(CancelSubscriptionOutcome.NoActiveSubscription)
            assertThat(provider.cancelCalls).hasSize(0)
        }

    @Test
    fun `provider unavailable leaves the row in pending cancellation for retry`() =
        runTest {
            repository.save(subscription(userId = userId, externalRef = "sub_1"))
            provider.failCancelFor("sub_1")

            val error = runCatching { useCase.execute(userId) }.exceptionOrNull()
            assertThat(error).isNotNull().isInstanceOf(ProviderUnavailable::class)

            assertThat(repository.findByUserId(userId)!!.status).isEqualTo(SubscriptionStatus.PENDING_CANCELLATION)
            assertThat(publisher.events).hasSize(0)
            assertThat(notifier.cancellationConfirmations).hasSize(0)
        }

    @Test
    fun `sends a resiliation confirmation carrying the end-of-effect date on success`() =
        runTest {
            repository.save(subscription(userId = userId, externalRef = "sub_1", periodEnd = PERIOD_END))

            useCase.execute(userId)

            val confirmation = notifier.cancellationConfirmations.single()
            assertThat(confirmation.userId).isEqualTo(userId)
            assertThat(confirmation.periodEnd).isEqualTo(PERIOD_END)
            assertThat(confirmation.canceledAt).isEqualTo(FIXED_NOW)
        }

    @Test
    fun `swallows a confirmation send failure and still returns cancelled`() =
        runTest {
            repository.save(subscription(userId = userId, externalRef = "sub_1"))
            notifier.failOnce = true

            val outcome = useCase.execute(userId)

            assertThat(outcome).isInstanceOf(CancelSubscriptionOutcome.Cancelled::class)
            assertThat(repository.findByUserId(userId)!!.status).isEqualTo(SubscriptionStatus.PENDING_CANCELLATION)
            assertThat(notifier.cancellationConfirmations).hasSize(0)
        }

    @Test
    fun `sends no confirmation when there is nothing to cancel`() =
        runTest {
            useCase.execute(userId)

            assertThat(notifier.cancellationConfirmations).hasSize(0)
        }
}
