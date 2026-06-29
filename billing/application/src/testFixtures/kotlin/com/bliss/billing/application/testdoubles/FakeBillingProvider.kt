package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.CheckoutUrls
import com.bliss.billing.application.ports.ProviderSubscriptionState
import com.bliss.billing.domain.Tier
import java.util.UUID

/** In-memory BillingProviderPort: states are seeded per reference; `cancel` is idempotent and records calls; failures are configurable per reference. */
class FakeBillingProvider : BillingProviderPort {
    private val states = LinkedHashMap<String, ProviderSubscriptionState>()
    private val cancelFailures = mutableSetOf<String>()

    val cancelCalls = mutableListOf<String>()
    var lastCheckout: Pair<UUID, Tier>? = null
    var checkoutUrls: CheckoutUrls = CheckoutUrls("https://checkout.test/abc", "https://app.test/merci", "https://app.test/abonnement")

    fun seed(state: ProviderSubscriptionState) {
        states[state.externalRef] = state
    }

    fun failCancelFor(externalRef: String) {
        cancelFailures.add(externalRef)
    }

    override suspend fun createCheckout(
        userId: UUID,
        tier: Tier,
    ): CheckoutUrls {
        lastCheckout = userId to tier
        return checkoutUrls
    }

    override suspend fun fetchByReference(externalRef: String): ProviderSubscriptionState? = states[externalRef]

    override suspend fun cancel(externalRef: String) {
        if (externalRef in cancelFailures) throw IllegalStateException("provider cancel failed for $externalRef")
        cancelCalls.add(externalRef)
    }
}
