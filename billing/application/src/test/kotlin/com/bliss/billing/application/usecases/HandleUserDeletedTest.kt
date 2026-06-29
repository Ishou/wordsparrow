package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.application.testdoubles.FixedClock
import com.bliss.billing.application.testdoubles.RecordingEntitlementPublisher
import com.bliss.billing.application.testdoubles.SequentialEventIdGenerator
import com.bliss.billing.domain.SubscriptionStatus
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.util.UUID

class HandleUserDeletedTest {
    private val provider = FakeBillingProvider()
    private val repository = FakeSubscriptionRepository()
    private val publisher = RecordingEntitlementPublisher()
    private val clock = FixedClock(FIXED_NOW)
    private val eventIds = SequentialEventIdGenerator()
    private val useCase = HandleUserDeleted(provider, repository, publisher, clock, eventIds)

    private val userId = UUID.randomUUID()

    @Test
    fun `cancels at the provider then erases the projection`() =
        runTest {
            repository.save(subscription(userId = userId, externalRef = "sub_1"))

            val outcome = useCase.execute(userId)

            assertThat(outcome).isEqualTo(HandleUserDeletedOutcome.Cancelled)
            assertThat(provider.cancelCalls).isEqualTo(listOf("sub_1"))
            assertThat(repository.findByUserId(userId)).isNull()
            assertThat(publisher.events.single().status).isEqualTo(SubscriptionStatus.CANCELED)
        }

    @Test
    fun `is a no-op when the user has no subscription`() =
        runTest {
            val outcome = useCase.execute(userId)

            assertThat(outcome).isEqualTo(HandleUserDeletedOutcome.NoSubscription)
            assertThat(provider.cancelCalls).hasSize(0)
            assertThat(publisher.events).hasSize(0)
        }

    @Test
    fun `a provider cancel failure leaves the row in pending cancellation with the ref intact`() =
        runTest {
            repository.save(subscription(userId = userId, externalRef = "sub_1"))
            provider.failCancelFor("sub_1")

            val error = runCatching { useCase.execute(userId) }.exceptionOrNull()
            assertThat(error).isNotNull().isInstanceOf(ProviderCancelFailed::class)

            val survivor = repository.findByUserId(userId)
            assertThat(survivor).isNotNull()
            assertThat(survivor!!.status).isEqualTo(SubscriptionStatus.PENDING_CANCELLATION)
            assertThat(survivor.externalRef).isEqualTo("sub_1")
            assertThat(publisher.events).hasSize(0)
        }

    @Test
    fun `retries cancellation idempotently from pending cancellation`() =
        runTest {
            repository.save(
                subscription(userId = userId, externalRef = "sub_1", status = SubscriptionStatus.PENDING_CANCELLATION),
            )

            val outcome = useCase.execute(userId)

            assertThat(outcome).isEqualTo(HandleUserDeletedOutcome.Cancelled)
            assertThat(provider.cancelCalls).isEqualTo(listOf("sub_1"))
            assertThat(repository.findByUserId(userId)).isNull()
            assertThat(publisher.events).hasSize(1)
            assertThat(publisher.events.single().status).isEqualTo(SubscriptionStatus.CANCELED)
        }

    @Test
    fun `skips provider cancel and erases a canceled subscription`() =
        runTest {
            repository.save(subscription(userId = userId, externalRef = "sub_1", status = SubscriptionStatus.CANCELED))

            val outcome = useCase.execute(userId)

            assertThat(outcome).isEqualTo(HandleUserDeletedOutcome.Cancelled)
            assertThat(provider.cancelCalls).hasSize(0)
            assertThat(repository.findByUserId(userId)).isNull()
            assertThat(publisher.events).hasSize(0)
        }

    @Test
    fun `skips provider cancel and erases an expired subscription`() =
        runTest {
            repository.save(subscription(userId = userId, externalRef = "sub_1", status = SubscriptionStatus.EXPIRED))

            val outcome = useCase.execute(userId)

            assertThat(outcome).isEqualTo(HandleUserDeletedOutcome.Cancelled)
            assertThat(provider.cancelCalls).hasSize(0)
            assertThat(repository.findByUserId(userId)).isNull()
            assertThat(publisher.events).hasSize(0)
        }
}
