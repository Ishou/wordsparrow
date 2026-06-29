package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.domain.Tier
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.util.UUID

class EntitlementQueryTest {
    private val repository = FakeSubscriptionRepository()
    private val useCase = EntitlementQuery(repository)

    @Test
    fun `a never-subscribed user resolves to the free capability-less entitlement`() =
        runTest {
            val entitlement = useCase.execute(UUID.randomUUID())

            assertThat(entitlement.tier).isEqualTo(Tier.free)
            assertThat(entitlement.capabilities).isEmpty()
        }

    @Test
    fun `a subscribed user resolves to their stored entitlement`() =
        runTest {
            val userId = UUID.randomUUID()
            repository.save(subscription(userId = userId, tier = Tier.of("supporter")))

            val entitlement = useCase.execute(userId)

            assertThat(entitlement.tier).isEqualTo(Tier.of("supporter"))
        }
}
