package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.CheckoutUrls
import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.Tier
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException

sealed interface CreateCheckoutSessionOutcome {
    data class Success(
        val urls: CheckoutUrls,
    ) : CreateCheckoutSessionOutcome

    data object AlreadySubscribed : CreateCheckoutSessionOutcome
}

class CreateCheckoutSession(
    private val provider: BillingProviderPort,
    private val repository: SubscriptionRepository,
) {
    suspend fun execute(
        userId: UUID,
        tier: Tier,
        cadence: Cadence,
    ): CreateCheckoutSessionOutcome {
        if (repository.findByUserId(userId)?.status?.isLive() == true) {
            return CreateCheckoutSessionOutcome.AlreadySubscribed
        }
        val urls =
            try {
                provider.createCheckout(userId, tier, cadence)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                throw ProviderUnavailable(e)
            }
        return CreateCheckoutSessionOutcome.Success(urls)
    }
}
