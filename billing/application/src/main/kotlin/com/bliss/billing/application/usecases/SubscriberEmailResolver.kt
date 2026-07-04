package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.ConsentRepository
import java.util.UUID

/** Resolves the recipient address at send time: the checkout-captured email first, else the provider's customer email (ADR-0094 §1; ADR-0082 absent-until-captured). Shared by the immediate send and the drain so a retry recovers an address that was unresolvable earlier. */
class SubscriberEmailResolver(
    private val consents: ConsentRepository,
    private val provider: BillingProviderPort,
) {
    suspend fun resolve(userId: UUID): String? {
        val email = consents.findLatestEmail(userId) ?: provider.fetchCustomerEmail(userId)
        return email?.takeIf { it.isNotBlank() }
    }
}
