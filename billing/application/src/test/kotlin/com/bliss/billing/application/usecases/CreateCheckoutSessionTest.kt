package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNotNull
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.domain.Tier
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.util.UUID

class CreateCheckoutSessionTest {
    private val provider = FakeBillingProvider()
    private val repository = FakeSubscriptionRepository()
    private val useCase = CreateCheckoutSession(provider, repository)

    private val userId = UUID.randomUUID()
    private val tier = Tier.of("supporter")

    @Test
    fun `returns checkout urls when no live subscription exists`() =
        runTest {
            val outcome = useCase.execute(userId, tier)

            assertThat(outcome).isInstanceOf(CreateCheckoutSessionOutcome.Success::class)
            assertThat(provider.lastCheckout).isEqualTo(userId to tier)
        }

    @Test
    fun `returns already subscribed when a live subscription exists`() =
        runTest {
            repository.save(subscription(userId = userId))

            val outcome = useCase.execute(userId, tier)

            assertThat(outcome).isEqualTo(CreateCheckoutSessionOutcome.AlreadySubscribed)
        }

    @Test
    fun `provider failure throws ProviderUnavailable`() =
        runTest {
            provider.failCheckoutOnce = true

            val error = runCatching { useCase.execute(userId, tier) }.exceptionOrNull()

            assertThat(error).isNotNull().isInstanceOf(ProviderUnavailable::class)
        }
}
