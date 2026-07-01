package com.bliss.billing.application.ports

import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import java.time.Instant
import java.util.UUID

/** Provider-hosted checkout URLs returned to the caller to redirect the browser (ADR-0078: SAQ-A hosted checkout, no card data). */
data class CheckoutUrls(
    val checkoutUrl: String,
    val successUrl: String,
    val cancelUrl: String,
)

/** Authoritative subscription state re-fetched from the provider; the system-of-record snapshot a webhook callback is authenticated against (ADR-0078). */
data class ProviderSubscriptionState(
    val externalRef: String,
    val userId: UUID,
    val tier: Tier,
    val status: SubscriptionStatus,
    val source: BillingSource,
    val periodEnd: Instant?,
)

/** Lean provider-side handle enumerated by the reconciliation backstop; only the opaque [externalRef] is load-bearing, [userId] aids log correlation (ADR-0078). */
data class ProviderSubscriptionRef(
    val externalRef: String,
    val userId: UUID?,
)

/** Anti-corruption port over the payment provider; only infrastructure knows a provider exists, and provider payload shapes never leak past it (ADR-0078). */
interface BillingProviderPort {
    suspend fun createCheckout(
        userId: UUID,
        tier: Tier,
        cadence: Cadence,
    ): CheckoutUrls

    /** Create the recurring subscription from a paid first-payment context (the mandate it established); returns the authoritative state keyed by the new subscription's [ProviderSubscriptionState.externalRef] (ADR-0078). */
    suspend fun createSubscription(
        userId: UUID,
        firstPaymentRef: String,
        tier: Tier,
    ): ProviderSubscriptionState

    /** Re-fetch the authoritative state by opaque reference; used to authenticate webhooks (re-fetch-by-id) and reconcile. Null when the provider has no such resource. */
    suspend fun fetchByReference(externalRef: String): ProviderSubscriptionState?

    /** Cancel at the provider. Idempotent: cancelling an already-cancelled subscription is a no-op (ADR-0078 deletion-cancellation invariant). */
    suspend fun cancel(externalRef: String)

    /** Enumerate every subscription the provider still considers active; the reconciliation backstop cancels any with no live local intent (ADR-0078). */
    suspend fun listActiveSubscriptions(): List<ProviderSubscriptionRef>
}
