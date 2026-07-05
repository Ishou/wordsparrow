package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.containsExactly
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

class ReactivateSubscriptionTest {
    private val provider = FakeBillingProvider()
    private val repository = FakeSubscriptionRepository()
    private val publisher = RecordingSubscriptionPublisher()
    private val clock = FixedClock(FIXED_NOW)
    private val eventIds = SequentialEventIdGenerator()
    private val useCase = ReactivateSubscription(provider, repository, publisher, clock, eventIds)

    private val userId = UUID.randomUUID()

    @Test
    fun `resumes a pending cancellation whose period is still running off the surviving mandate`() =
        runTest {
            repository.save(
                subscription(
                    userId = userId,
                    status = SubscriptionStatus.PENDING_CANCELLATION,
                    externalRef = "cust:sub_old",
                    periodEnd = PERIOD_END,
                ),
            )
            provider.subscriptionToReactivate =
                providerState(userId = userId, externalRef = "cust:sub_new", periodEnd = PERIOD_END)

            val outcome = useCase.execute(userId)

            assertThat(outcome).isInstanceOf(ReactivateSubscriptionOutcome.Reactivated::class)
            val reactivated = outcome as ReactivateSubscriptionOutcome.Reactivated
            assertThat(reactivated.subscriptionView.status).isEqualTo(SubscriptionStatus.ACTIVE)

            val call = provider.reactivateCalls.single()
            assertThat(call.currentExternalRef).isEqualTo("cust:sub_old")
            assertThat(call.startDate).isEqualTo(PERIOD_END)

            val stored = repository.findByUserId(userId)
            assertThat(stored).isNotNull()
            assertThat(stored!!.status).isEqualTo(SubscriptionStatus.ACTIVE)
            assertThat(stored.externalRef).isEqualTo("cust:sub_new")
            assertThat(stored.periodEnd).isEqualTo(PERIOD_END)

            val event = publisher.events.single()
            assertThat(event.status).isEqualTo(SubscriptionStatus.ACTIVE)
            assertThat(event.periodEnd).isEqualTo(PERIOD_END)
            assertThat(event.changedAt).isEqualTo(FIXED_NOW)
        }

    @Test
    fun `is not reactivatable when there is no subscription`() =
        runTest {
            val outcome = useCase.execute(userId)

            assertThat(outcome).isEqualTo(ReactivateSubscriptionOutcome.NotReactivatable)
            assertThat(provider.reactivateCalls).hasSize(0)
        }

    @Test
    fun `is not reactivatable for an active subscription`() =
        runTest {
            repository.save(subscription(userId = userId, status = SubscriptionStatus.ACTIVE))

            val outcome = useCase.execute(userId)

            assertThat(outcome).isEqualTo(ReactivateSubscriptionOutcome.NotReactivatable)
            assertThat(provider.reactivateCalls).hasSize(0)
        }

    @Test
    fun `is not reactivatable once the pending cancellation has lapsed past its period`() =
        runTest {
            repository.save(
                subscription(
                    userId = userId,
                    status = SubscriptionStatus.PENDING_CANCELLATION,
                    periodEnd = FIXED_NOW.minusSeconds(60),
                ),
            )

            val outcome = useCase.execute(userId)

            assertThat(outcome).isEqualTo(ReactivateSubscriptionOutcome.NotReactivatable)
            assertThat(provider.reactivateCalls).hasSize(0)
        }

    @Test
    fun `a provider failure surfaces as ProviderUnavailable and leaves the row pending`() =
        runTest {
            repository.save(
                subscription(userId = userId, status = SubscriptionStatus.PENDING_CANCELLATION, periodEnd = PERIOD_END),
            )
            provider.failReactivateOnce = true

            val error = runCatching { useCase.execute(userId) }.exceptionOrNull()

            assertThat(error).isNotNull().isInstanceOf(ProviderUnavailable::class)
            assertThat(repository.findByUserId(userId)!!.status).isEqualTo(SubscriptionStatus.PENDING_CANCELLATION)
            assertThat(publisher.events).hasSize(0)
        }

    @Test
    fun `no reusable mandate surfaces as NoPaymentMethod and leaves the row pending`() =
        runTest {
            repository.save(
                subscription(userId = userId, status = SubscriptionStatus.PENDING_CANCELLATION, periodEnd = PERIOD_END),
            )
            provider.failReactivateNoMandateOnce = true

            val outcome = useCase.execute(userId)

            assertThat(outcome).isEqualTo(ReactivateSubscriptionOutcome.NoPaymentMethod)
            assertThat(repository.findByUserId(userId)!!.status).isEqualTo(SubscriptionStatus.PENDING_CANCELLATION)
            assertThat(publisher.events).hasSize(0)
        }

    @Test
    fun `unresolvable cadence surfaces as CadenceUnresolvable and leaves the row pending`() =
        runTest {
            repository.save(
                subscription(userId = userId, status = SubscriptionStatus.PENDING_CANCELLATION, periodEnd = PERIOD_END),
            )
            provider.failReactivateCadenceUnresolvableOnce = true

            val outcome = useCase.execute(userId)

            assertThat(outcome).isEqualTo(ReactivateSubscriptionOutcome.CadenceUnresolvable)
            assertThat(repository.findByUserId(userId)!!.status).isEqualTo(SubscriptionStatus.PENDING_CANCELLATION)
            assertThat(publisher.events).hasSize(0)
        }

    @Test
    fun `a concurrent reactivate that lost the CAS cancels its orphan sub and returns idempotently`() =
        runTest {
            repository.save(
                subscription(
                    userId = userId,
                    status = SubscriptionStatus.PENDING_CANCELLATION,
                    externalRef = "cust:sub_old",
                    periodEnd = PERIOD_END,
                ),
            )
            provider.subscriptionToReactivate =
                providerState(userId = userId, externalRef = "cust:sub_loser", periodEnd = PERIOD_END)
            // Simulate a concurrent reactivate that already won: the row is active off the winner's sub before this attempt's CAS runs.
            repository.beforeCompareAndSet = {
                repository.save(
                    subscription(
                        userId = userId,
                        status = SubscriptionStatus.ACTIVE,
                        externalRef = "cust:sub_winner",
                        periodEnd = PERIOD_END,
                    ),
                )
                repository.beforeCompareAndSet = null
            }

            val outcome = useCase.execute(userId)

            assertThat(outcome).isInstanceOf(ReactivateSubscriptionOutcome.Reactivated::class)
            // The winner's sub survives; the loser's just-created orphan is cancelled so it can never double-charge.
            assertThat(provider.cancelCalls).containsExactly("cust:sub_loser")
            val stored = repository.findByUserId(userId)!!
            assertThat(stored.status).isEqualTo(SubscriptionStatus.ACTIVE)
            assertThat(stored.externalRef).isEqualTo("cust:sub_winner")
            assertThat(publisher.events).hasSize(0)
        }

    @Test
    fun `reactivate racing the expiry sweep does not clobber a row already expired`() =
        runTest {
            repository.save(
                subscription(
                    userId = userId,
                    status = SubscriptionStatus.PENDING_CANCELLATION,
                    externalRef = "cust:sub_old",
                    periodEnd = PERIOD_END,
                ),
            )
            provider.subscriptionToReactivate =
                providerState(userId = userId, externalRef = "cust:sub_loser", periodEnd = PERIOD_END)
            // The expiry sweep wins the race: the row is expired before this reactivate's CAS runs.
            repository.beforeCompareAndSet = {
                repository.save(
                    subscription(userId = userId, status = SubscriptionStatus.EXPIRED, periodEnd = PERIOD_END),
                )
                repository.beforeCompareAndSet = null
            }

            val outcome = useCase.execute(userId)

            assertThat(outcome).isEqualTo(ReactivateSubscriptionOutcome.NotReactivatable)
            assertThat(provider.cancelCalls).containsExactly("cust:sub_loser")
            assertThat(repository.findByUserId(userId)!!.status).isEqualTo(SubscriptionStatus.EXPIRED)
            assertThat(publisher.events).hasSize(0)
        }
}
