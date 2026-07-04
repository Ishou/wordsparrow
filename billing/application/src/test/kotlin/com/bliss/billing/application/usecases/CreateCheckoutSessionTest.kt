package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNotNull
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeConsentRepository
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.application.testdoubles.FixedClock
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.CheckoutConsent
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class CreateCheckoutSessionTest {
    private val provider = FakeBillingProvider()
    private val repository = FakeSubscriptionRepository()
    private val consents = FakeConsentRepository()
    private val acceptedAt = Instant.parse("2026-07-04T10:15:30Z")
    private val clock = FixedClock(acceptedAt)
    private val useCase = CreateCheckoutSession(provider, repository, consents, clock)

    private val userId = UUID.randomUUID()
    private val tier = Tier.of("supporter")
    private val consent = CheckoutConsent(cgvAccepted = true, cgvVersion = "1.0", withdrawalWaiver = true)

    @Test
    fun `returns checkout urls when no live subscription exists`() =
        runTest {
            val outcome = useCase.execute(userId, tier, Cadence.MONTHLY, email = null, consent = null)

            assertThat(outcome).isInstanceOf(CreateCheckoutSessionOutcome.Success::class)
            assertThat(provider.lastCheckout).isEqualTo(Triple(userId, tier, Cadence.MONTHLY))
        }

    @Test
    fun `forwards the chosen cadence to the provider`() =
        runTest {
            useCase.execute(userId, tier, Cadence.YEARLY, email = null, consent = null)

            assertThat(provider.lastCheckout).isEqualTo(Triple(userId, tier, Cadence.YEARLY))
        }

    @Test
    fun `forwards the caller email to the provider`() =
        runTest {
            useCase.execute(userId, tier, Cadence.MONTHLY, email = "player@example.com", consent = null)

            assertThat(provider.lastCheckoutEmail).isEqualTo("player@example.com")
        }

    @Test
    fun `records consent stamped with server time when consent is present`() =
        runTest {
            useCase.execute(userId, tier, Cadence.MONTHLY, email = null, consent = consent)

            assertThat(consents.records).isEqualTo(
                listOf(FakeConsentRepository.Recorded(userId, consent, email = null, acceptedAt)),
            )
        }

    @Test
    fun `stores the checkout email on the consent record`() =
        runTest {
            useCase.execute(userId, tier, Cadence.MONTHLY, email = "player@example.com", consent = consent)

            assertThat(consents.records).isEqualTo(
                listOf(FakeConsentRepository.Recorded(userId, consent, email = "player@example.com", acceptedAt)),
            )
        }

    @Test
    fun `records no consent when consent is absent`() =
        runTest {
            useCase.execute(userId, tier, Cadence.MONTHLY, email = null, consent = null)

            assertThat(consents.records).isEmpty()
        }

    @Test
    fun `records no consent when a live subscription already exists`() =
        runTest {
            repository.save(subscription(userId = userId))

            useCase.execute(userId, tier, Cadence.MONTHLY, email = null, consent = consent)

            assertThat(consents.records).isEmpty()
        }

    @Test
    fun `returns already subscribed when a live subscription exists`() =
        runTest {
            repository.save(subscription(userId = userId))

            val outcome = useCase.execute(userId, tier, Cadence.MONTHLY, email = null, consent = null)

            assertThat(outcome).isEqualTo(CreateCheckoutSessionOutcome.AlreadySubscribed)
        }

    @Test
    fun `blocks a pending cancellation whose paid period is still running`() =
        runTest {
            repository.save(
                subscription(userId = userId, status = SubscriptionStatus.PENDING_CANCELLATION, periodEnd = acceptedAt.plusSeconds(86_400)),
            )

            val outcome = useCase.execute(userId, tier, Cadence.MONTHLY, email = null, consent = null)

            assertThat(outcome).isEqualTo(CreateCheckoutSessionOutcome.AlreadySubscribed)
        }

    @Test
    fun `allows a fresh subscribe once a pending cancellation has lapsed past its period`() =
        runTest {
            repository.save(
                subscription(
                    userId = userId,
                    status = SubscriptionStatus.PENDING_CANCELLATION,
                    periodEnd = acceptedAt.minusSeconds(86_400),
                ),
            )

            val outcome = useCase.execute(userId, tier, Cadence.MONTHLY, email = null, consent = null)

            assertThat(outcome).isInstanceOf(CreateCheckoutSessionOutcome.Success::class)
        }

    @Test
    fun `provider failure throws ProviderUnavailable`() =
        runTest {
            provider.failCheckoutOnce = true

            val error = runCatching { useCase.execute(userId, tier, Cadence.MONTHLY, email = null, consent = null) }.exceptionOrNull()

            assertThat(error).isNotNull().isInstanceOf(ProviderUnavailable::class)
        }
}
