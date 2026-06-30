package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.hasSize
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNull
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.application.testdoubles.FixedClock
import com.bliss.billing.application.testdoubles.InMemoryProcessedEventLedger
import com.bliss.billing.application.testdoubles.RecordingSubscriptionPublisher
import com.bliss.billing.application.testdoubles.SequentialEventIdGenerator
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.util.UUID

class IngestProviderEventTest {
    private val provider = FakeBillingProvider()
    private val repository = FakeSubscriptionRepository()
    private val publisher = RecordingSubscriptionPublisher()
    private val ledger = InMemoryProcessedEventLedger()
    private val clock = FixedClock(FIXED_NOW)
    private val eventIds = SequentialEventIdGenerator()
    private val useCase = IngestProviderEvent(provider, repository, publisher, ledger, clock, eventIds)

    private val userId = UUID.randomUUID()
    private val subscriptionRef = "cust_x:sub_1"

    private fun seedFirstPayment(
        paymentRef: String = "tr_1",
        tier: Tier = Tier.of("supporter"),
    ) {
        provider.seed(providerState(userId, externalRef = paymentRef, tier = tier, periodEnd = null))
        provider.subscriptionToCreate = providerState(userId, externalRef = subscriptionRef, tier = tier)
    }

    @Test
    fun `creates the recurring subscription on a paid first payment`() =
        runTest {
            seedFirstPayment()

            val outcome = useCase.execute("tr_1")

            assertThat(outcome).isInstanceOf(IngestOutcome.Applied::class)
            assertThat(provider.createSubscriptionCalls).hasSize(1)
            assertThat(provider.createSubscriptionCalls.single().second).isEqualTo("tr_1")
            val stored = repository.findByUserId(userId)!!
            assertThat(stored.externalRef).isEqualTo(subscriptionRef)
            assertThat(stored.status).isEqualTo(SubscriptionStatus.ACTIVE)
            assertThat(stored.periodEnd).isEqualTo(PERIOD_END)
            assertThat(publisher.events).hasSize(1)
            assertThat(publisher.events.single().changedAt).isEqualTo(FIXED_NOW)
        }

    @Test
    fun `stamps a fresh event id on each emission`() =
        runTest {
            seedFirstPayment()
            useCase.execute("tr_1")

            assertThat(publisher.events.single().eventId).isEqualTo(eventIds.minted.single())
        }

    @Test
    fun `redelivered first payment webhook creates exactly one subscription and publishes once`() =
        runTest {
            seedFirstPayment()
            useCase.execute("tr_1")

            val outcome = useCase.execute("tr_1")

            assertThat(outcome).isEqualTo(IngestOutcome.Unchanged)
            assertThat(provider.createSubscriptionCalls).hasSize(1)
            assertThat(repository.findByUserId(userId)!!.externalRef).isEqualTo(subscriptionRef)
            assertThat(publisher.events).hasSize(1)
        }

    @Test
    fun `does not emit when a concurrent sibling already recorded the ledger`() =
        runTest {
            seedFirstPayment()
            ledger.recordIfAbsent("tr_1")

            val outcome = useCase.execute("tr_1")

            assertThat(outcome).isEqualTo(IngestOutcome.Unchanged)
            assertThat(publisher.events).isEmpty()
        }

    @Test
    fun `retries subscription creation after a transient provider failure`() =
        runTest {
            seedFirstPayment()
            provider.failCreateSubscriptionOnce = true

            runCatching { useCase.execute("tr_1") }

            // Ledger unclaimed after failure: retry can re-enter createFromFirstPayment
            assertThat(repository.findByUserId(userId)).isNull()
            assertThat(publisher.events).isEmpty()

            val outcome = useCase.execute("tr_1")

            assertThat(outcome).isInstanceOf(IngestOutcome.Applied::class)
            assertThat(repository.findByUserId(userId)?.externalRef).isEqualTo(subscriptionRef)
            assertThat(publisher.events).hasSize(1)
        }

    @Test
    fun `ignores an unknown reference (forged or stale callback)`() =
        runTest {
            val outcome = useCase.execute("tr_missing")

            assertThat(outcome).isEqualTo(IngestOutcome.Ignored)
            assertThat(provider.createSubscriptionCalls).isEmpty()
            assertThat(publisher.events).isEmpty()
        }

    @Test
    fun `ignores a first payment that is not yet paid`() =
        runTest {
            provider.seed(providerState(userId, externalRef = "tr_1", status = SubscriptionStatus.EXPIRED, periodEnd = null))

            val outcome = useCase.execute("tr_1")

            assertThat(outcome).isEqualTo(IngestOutcome.Ignored)
            assertThat(provider.createSubscriptionCalls).isEmpty()
            assertThat(repository.findByUserId(userId)).isNull()
        }

    @Test
    fun `applies a legal transition on the existing subscription and re-publishes`() =
        runTest {
            seedFirstPayment()
            useCase.execute("tr_1")

            provider.seed(providerState(userId, externalRef = subscriptionRef, status = SubscriptionStatus.PAST_DUE))
            val outcome = useCase.execute(subscriptionRef)

            assertThat(outcome).isInstanceOf(IngestOutcome.Applied::class)
            assertThat(repository.findByExternalRef(subscriptionRef)!!.status).isEqualTo(SubscriptionStatus.PAST_DUE)
            assertThat(provider.createSubscriptionCalls).hasSize(1)
            assertThat(publisher.events).hasSize(2)
        }

    @Test
    fun `refreshes period end and tier on a renewal with unchanged status`() =
        runTest {
            seedFirstPayment()
            useCase.execute("tr_1")

            val laterEnd = PERIOD_END.plusSeconds(86_400)
            provider.seed(providerState(userId, externalRef = subscriptionRef, tier = Tier.of("patron"), periodEnd = laterEnd))
            val outcome = useCase.execute(subscriptionRef)

            assertThat(outcome).isInstanceOf(IngestOutcome.Applied::class)
            val stored = repository.findByExternalRef(subscriptionRef)!!
            assertThat(stored.periodEnd).isEqualTo(laterEnd)
            assertThat(stored.tier).isEqualTo(Tier.of("patron"))
        }

    @Test
    fun `redelivery of an identical subscription state is a no-op without re-publish`() =
        runTest {
            seedFirstPayment()
            useCase.execute("tr_1")

            provider.seed(providerState(userId, externalRef = subscriptionRef))
            val outcome = useCase.execute(subscriptionRef)

            assertThat(outcome).isEqualTo(IngestOutcome.Unchanged)
            assertThat(publisher.events).hasSize(1)
        }

    @Test
    fun `drops an illegal transition without mutating or re-publishing`() =
        runTest {
            seedFirstPayment()
            useCase.execute("tr_1")
            provider.seed(providerState(userId, externalRef = subscriptionRef, status = SubscriptionStatus.EXPIRED))
            useCase.execute(subscriptionRef)

            provider.seed(providerState(userId, externalRef = subscriptionRef, status = SubscriptionStatus.PAST_DUE))
            val outcome = useCase.execute(subscriptionRef)

            assertThat(outcome).isEqualTo(IngestOutcome.Unchanged)
            assertThat(repository.findByExternalRef(subscriptionRef)!!.status).isEqualTo(SubscriptionStatus.EXPIRED)
        }
}
