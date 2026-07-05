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
    // The checkout cadence, recovered from provider metadata; drives the receipt price/périodicité, null on legacy states pre-dating cadence capture.
    val cadence: Cadence? = null,
)

/** Lean provider-side handle enumerated by the reconciliation backstop; only the opaque [externalRef] is load-bearing, [userId] aids log correlation (ADR-0078). */
data class ProviderSubscriptionRef(
    val externalRef: String,
    val userId: UUID?,
)

/** Raised by [BillingProviderPort.reactivate] when the customer has no reusable (valid) mandate, so no no-charge resume is possible; the use-case surfaces this to the caller (ADR-0078). */
class NoValidMandateException(
    message: String,
) : RuntimeException(message)

/** Raised by [BillingProviderPort.reactivate] when the cancelled subscription's cadence can't be recovered; re-subscribing at a guessed interval would silently downgrade annual→monthly, so we fail instead (ADR-0080). */
class ReactivationCadenceUnresolvableException(
    message: String,
) : RuntimeException(message)

/** Anti-corruption port over the payment provider; only infrastructure knows a provider exists, and provider payload shapes never leak past it (ADR-0078). */
interface BillingProviderPort {
    /** Start hosted checkout; [email] (session-derived, nullable) is passed through to the provider customer for receipts/invoices, never stored (ADR-0082). */
    suspend fun createCheckout(
        userId: UUID,
        tier: Tier,
        cadence: Cadence,
        email: String?,
    ): CheckoutUrls

    /** Create the recurring subscription from a paid first-payment context (the mandate it established); returns the authoritative state keyed by the new subscription's [ProviderSubscriptionState.externalRef] (ADR-0078). */
    suspend fun createSubscription(
        userId: UUID,
        firstPaymentRef: String,
        tier: Tier,
    ): ProviderSubscriptionState

    /** Re-fetch the authoritative state by opaque reference; used to authenticate webhooks (re-fetch-by-id) and reconcile. Null when the provider has no such resource. */
    suspend fun fetchByReference(externalRef: String): ProviderSubscriptionState?

    /** The customer's contact email from the provider Customer (captured at checkout); passed through for receipts, never stored (ADR-0082). Null when unknown or unavailable. */
    suspend fun fetchCustomerEmail(userId: UUID): String?

    /** Cancel at the provider. Idempotent: cancelling an already-cancelled subscription is a no-op (ADR-0078 deletion-cancellation invariant). */
    suspend fun cancel(externalRef: String)

    /** Resume a scheduled non-renewal: create a fresh recurring subscription off the customer's surviving mandate, first charge deferred to [startDate] (= the current `periodEnd`) so no charge lands now; returns the state keyed by the new subscription's [ProviderSubscriptionState.externalRef]. Throws [NoValidMandateException] when no reusable mandate remains. */
    suspend fun reactivate(
        userId: UUID,
        currentExternalRef: String,
        tier: Tier,
        startDate: Instant,
    ): ProviderSubscriptionState

    /** Enumerate every subscription the provider still considers active; the reconciliation backstop cancels any with no live local intent (ADR-0078). */
    suspend fun listActiveSubscriptions(): List<ProviderSubscriptionRef>
}
