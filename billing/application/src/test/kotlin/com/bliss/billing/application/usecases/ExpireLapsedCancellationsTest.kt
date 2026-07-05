package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.application.testdoubles.FixedClock
import com.bliss.billing.application.testdoubles.RecordingSubscriptionPublisher
import com.bliss.billing.application.testdoubles.SequentialEventIdGenerator
import com.bliss.billing.domain.SubscriptionStatus
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.util.UUID

class ExpireLapsedCancellationsTest {
    private val repository = FakeSubscriptionRepository()
    private val publisher = RecordingSubscriptionPublisher()
    private val clock = FixedClock(FIXED_NOW)
    private val eventIds = SequentialEventIdGenerator()
    private val useCase = ExpireLapsedCancellations(repository, publisher, clock, eventIds)

    private val userId = UUID.randomUUID()

    @Test
    fun `expires a pending cancellation whose period has passed and emits an expired event`() =
        runTest {
            repository.save(
                subscription(
                    userId = userId,
                    status = SubscriptionStatus.PENDING_CANCELLATION,
                    periodEnd = FIXED_NOW.minusSeconds(60),
                ),
            )

            val summary = useCase.execute()

            assertThat(summary.expired).isEqualTo(1)
            assertThat(repository.findByUserId(userId)!!.status).isEqualTo(SubscriptionStatus.EXPIRED)
            val event = publisher.events.single()
            assertThat(event.status).isEqualTo(SubscriptionStatus.EXPIRED)
            assertThat(event.userId).isEqualTo(userId)
            assertThat(event.changedAt).isEqualTo(FIXED_NOW)
        }

    @Test
    fun `expires a pending cancellation exactly at its period end`() =
        runTest {
            repository.save(
                subscription(userId = userId, status = SubscriptionStatus.PENDING_CANCELLATION, periodEnd = FIXED_NOW),
            )

            val summary = useCase.execute()

            assertThat(summary.expired).isEqualTo(1)
            assertThat(publisher.events.single().status).isEqualTo(SubscriptionStatus.EXPIRED)
        }

    @Test
    fun `leaves a pending cancellation whose period is still running untouched`() =
        runTest {
            repository.save(
                subscription(
                    userId = userId,
                    status = SubscriptionStatus.PENDING_CANCELLATION,
                    periodEnd = FIXED_NOW.plusSeconds(60),
                ),
            )

            val summary = useCase.execute()

            assertThat(summary.expired).isEqualTo(0)
            assertThat(repository.findByUserId(userId)!!.status).isEqualTo(SubscriptionStatus.PENDING_CANCELLATION)
            assertThat(publisher.events).hasSize(0)
        }

    @Test
    fun `leaves active, canceled and expired subscriptions untouched even with a past period`() =
        runTest {
            val active = UUID.randomUUID()
            val canceled = UUID.randomUUID()
            val expired = UUID.randomUUID()
            repository.save(subscription(userId = active, status = SubscriptionStatus.ACTIVE, periodEnd = FIXED_NOW.minusSeconds(60)))
            repository.save(subscription(userId = canceled, status = SubscriptionStatus.CANCELED, periodEnd = FIXED_NOW.minusSeconds(60)))
            repository.save(subscription(userId = expired, status = SubscriptionStatus.EXPIRED, periodEnd = FIXED_NOW.minusSeconds(60)))

            val summary = useCase.execute()

            assertThat(summary.expired).isEqualTo(0)
            assertThat(publisher.events).hasSize(0)
            assertThat(repository.findByUserId(active)!!.status).isEqualTo(SubscriptionStatus.ACTIVE)
        }

    @Test
    fun `running twice has the same effect as running once`() =
        runTest {
            repository.save(
                subscription(
                    userId = userId,
                    status = SubscriptionStatus.PENDING_CANCELLATION,
                    periodEnd = FIXED_NOW.minusSeconds(60),
                ),
            )

            useCase.execute()
            val second = useCase.execute()

            assertThat(second.expired).isEqualTo(0)
            assertThat(publisher.events.map { it.status }).containsExactly(SubscriptionStatus.EXPIRED)
        }

    @Test
    fun `skips a row a concurrent reactivate flipped to active and never clobbers it to expired`() =
        runTest {
            repository.save(
                subscription(
                    userId = userId,
                    status = SubscriptionStatus.PENDING_CANCELLATION,
                    periodEnd = FIXED_NOW.minusSeconds(60),
                ),
            )
            // The row is listed as lapsed, then a concurrent reactivate wins before the sweep's CAS write.
            repository.beforeCompareAndSet = {
                repository.save(subscription(userId = userId, status = SubscriptionStatus.ACTIVE, periodEnd = PERIOD_END))
                repository.beforeCompareAndSet = null
            }

            val summary = useCase.execute()

            assertThat(summary.expired).isEqualTo(0)
            assertThat(repository.findByUserId(userId)!!.status).isEqualTo(SubscriptionStatus.ACTIVE)
            assertThat(publisher.events).hasSize(0)
        }
}
