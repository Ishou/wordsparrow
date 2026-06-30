package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNotNull
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.application.testdoubles.FixedClock
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
    private val useCase = CancelSubscription(provider, repository, publisher, clock, eventIds)

    private val userId = UUID.randomUUID()

    @Test
    fun `cancels at the provider and reflects canceled while keeping the row`() =
        runTest {
            repository.save(subscription(userId = userId, externalRef = "sub_1"))

            val outcome = useCase.execute(userId)

            assertThat(outcome).isInstanceOf(CancelSubscriptionOutcome.Cancelled::class)
            val cancelled = outcome as CancelSubscriptionOutcome.Cancelled
            assertThat(cancelled.subscriptionView.status).isEqualTo(SubscriptionStatus.CANCELED)
            assertThat(provider.cancelCalls).isEqualTo(listOf("sub_1"))
            val survivor = repository.findByUserId(userId)
            assertThat(survivor).isNotNull()
            assertThat(survivor!!.status).isEqualTo(SubscriptionStatus.CANCELED)
            assertThat(publisher.events.single().status).isEqualTo(SubscriptionStatus.CANCELED)
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
        }
}
