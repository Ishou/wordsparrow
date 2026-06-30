package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.util.UUID

class SubscriptionQueryTest {
    private val repository = FakeSubscriptionRepository()
    private val useCase = SubscriptionQuery(repository)

    @Test
    fun `a never-subscribed user resolves to the free projection`() =
        runTest {
            val view = useCase.execute(UUID.randomUUID())

            assertThat(view.tier).isEqualTo(Tier.free)
            assertThat(view.status).isEqualTo(SubscriptionStatus.EXPIRED)
        }

    @Test
    fun `a subscribed user resolves to their stored subscription`() =
        runTest {
            val userId = UUID.randomUUID()
            repository.save(subscription(userId = userId, tier = Tier.of("supporter")))

            val view = useCase.execute(userId)

            assertThat(view.tier).isEqualTo(Tier.of("supporter"))
            assertThat(view.status).isEqualTo(SubscriptionStatus.ACTIVE)
        }
}
