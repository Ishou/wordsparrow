package com.bliss.billing.infrastructure.provider

import java.time.Instant

/** Provider payment snapshot, reduced to primitives so no Mollie SDK type leaks past this boundary (ADR-0078). */
data class MolliePayment(
    val id: String,
    val status: String,
    val checkoutUrl: String?,
    val customerId: String?,
    val subscriptionId: String?,
    val metadata: Map<String, String>,
)

/** Provider subscription snapshot, reduced to primitives at the SDK boundary (ADR-0078). */
data class MollieSubscription(
    val id: String,
    val customerId: String,
    val status: String,
    val nextPaymentDate: Instant?,
    val metadata: Map<String, String>,
)

/** Raised by the boundary when a cancel targets a resource Mollie no longer has (404/410) or already cancelled (422), so cancel stays idempotent. */
class MollieResourceGoneException(
    message: String,
) : RuntimeException(message)

/**
 * Thin seam over the Mollie SDK: tests mock this interface (never the adapter logic), and the only
 * Mollie SDK import in the codebase lives in its production implementation (ADR-0078).
 */
interface MollieClient {
    suspend fun createCustomer(userReference: String): String

    suspend fun createFirstPayment(
        customerId: String,
        amountValue: String,
        currency: String,
        description: String,
        redirectUrl: String,
        cancelUrl: String,
        webhookUrl: String,
        metadata: Map<String, String>,
    ): MolliePayment

    suspend fun getPayment(paymentId: String): MolliePayment?

    suspend fun getSubscription(
        customerId: String,
        subscriptionId: String,
    ): MollieSubscription?

    /** Cancel at the provider. Throws [MollieResourceGoneException] when the subscription is already gone/cancelled. */
    suspend fun cancelSubscription(
        customerId: String,
        subscriptionId: String,
    )
}
