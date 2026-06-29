package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNull
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.application.testdoubles.FixedClock
import com.bliss.billing.application.testdoubles.RecordingEntitlementPublisher
import com.bliss.billing.application.testdoubles.SequentialEventIdGenerator
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.util.UUID

class IngestProviderEventTest {
    private val provider = FakeBillingProvider()
    private val repository = FakeSubscriptionRepository()
    private val publisher = RecordingEntitlementPublisher()
    private val clock = FixedClock(FIXED_NOW)
    private val eventIds = SequentialEventIdGenerator()
    private val useCase = IngestProviderEvent(provider, repository, publisher, clock, eventIds)

    private val userId = UUID.randomUUID()

    @Test
    fun `creates a projection from authoritative state on first sight`() =
        runTest {
            provider.seed(providerState(userId, externalRef = "sub_1"))

            val outcome = useCase.execute("sub_1")

            assertThat(outcome).isInstanceOf(IngestOutcome.Applied::class)
            val stored = repository.findByExternalRef("sub_1")!!
            assertThat(stored.userId).isEqualTo(userId)
            assertThat(stored.status).isEqualTo(SubscriptionStatus.ACTIVE)
            assertThat(publisher.events).hasSize(1)
            assertThat(publisher.events.single().changedAt).isEqualTo(FIXED_NOW)
        }

    @Test
    fun `stamps a fresh event id on each emission`() =
        runTest {
            provider.seed(providerState(userId, externalRef = "sub_1"))
            useCase.execute("sub_1")

            assertThat(publisher.events.single().eventId).isEqualTo(eventIds.minted.single())
        }

    @Test
    fun `ignores an unknown reference (forged or stale callback)`() =
        runTest {
            val outcome = useCase.execute("sub_missing")

            assertThat(outcome).isEqualTo(IngestOutcome.Ignored)
            assertThat(repository.findByExternalRef("sub_missing")).isNull()
            assertThat(publisher.events).hasSize(0)
        }

    @Test
    fun `redelivery of an identical state is a no-op without re-publish`() =
        runTest {
            provider.seed(providerState(userId, externalRef = "sub_1"))
            useCase.execute("sub_1")

            val outcome = useCase.execute("sub_1")

            assertThat(outcome).isEqualTo(IngestOutcome.Unchanged)
            assertThat(publisher.events).hasSize(1)
        }

    @Test
    fun `applies a legal transition and re-publishes`() =
        runTest {
            provider.seed(providerState(userId, externalRef = "sub_1"))
            useCase.execute("sub_1")

            provider.seed(providerState(userId, externalRef = "sub_1", status = SubscriptionStatus.PAST_DUE))
            val outcome = useCase.execute("sub_1")

            assertThat(outcome).isInstanceOf(IngestOutcome.Applied::class)
            assertThat(repository.findByExternalRef("sub_1")!!.status).isEqualTo(SubscriptionStatus.PAST_DUE)
            assertThat(publisher.events).hasSize(2)
        }

    @Test
    fun `refreshes period end and tier when the status is unchanged`() =
        runTest {
            provider.seed(providerState(userId, externalRef = "sub_1"))
            useCase.execute("sub_1")

            val laterEnd = PERIOD_END.plusSeconds(86_400)
            provider.seed(providerState(userId, externalRef = "sub_1", tier = Tier.of("patron"), periodEnd = laterEnd))
            val outcome = useCase.execute("sub_1")

            assertThat(outcome).isInstanceOf(IngestOutcome.Applied::class)
            val stored = repository.findByExternalRef("sub_1")!!
            assertThat(stored.periodEnd).isEqualTo(laterEnd)
            assertThat(stored.tier).isEqualTo(Tier.of("patron"))
        }

    @Test
    fun `drops an illegal transition without mutating or re-publishing`() =
        runTest {
            provider.seed(providerState(userId, externalRef = "sub_1", status = SubscriptionStatus.EXPIRED))
            useCase.execute("sub_1")

            provider.seed(providerState(userId, externalRef = "sub_1", status = SubscriptionStatus.PAST_DUE))
            val outcome = useCase.execute("sub_1")

            assertThat(outcome).isEqualTo(IngestOutcome.Unchanged)
            assertThat(repository.findByExternalRef("sub_1")!!.status).isEqualTo(SubscriptionStatus.EXPIRED)
            assertThat(publisher.events).hasSize(1)
        }
}
