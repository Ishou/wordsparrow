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
    // The mandate a paid first payment established; the recurring subscription is created against it (ADR-0078).
    val mandateId: String? = null,
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

/** Thin SDK seam: tests mock this interface, not the adapter; only Mollie SDK import lives in its impl (ADR-0078). */
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

    /** Create the recurring subscription against an existing mandate; the first payment must already be paid. */
    suspend fun createSubscription(
        customerId: String,
        mandateId: String,
        amountValue: String,
        currency: String,
        interval: String,
        description: String,
        webhookUrl: String,
        metadata: Map<String, String>,
    ): MollieSubscription

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
