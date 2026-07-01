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

/** One customer payment reduced to receipt primitives at the SDK boundary; amount stays the provider decimal string (ADR-0078: no PII). */
data class MolliePaymentRecord(
    val amountValue: String,
    val currency: String,
    val status: String,
    val paidAt: Instant?,
    val createdAt: Instant,
)

/** One page of a customer's payments, newest-first; [nextCursor] is the opaque `from` id for the next page or null on the last (ADR-0078). */
data class MolliePaymentPage(
    val payments: List<MolliePaymentRecord>,
    val nextCursor: String?,
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
    /** Create the provider Customer; [email] (nullable) rides on the Customer for receipts/invoices, omitted when absent (ADR-0082). */
    suspend fun createCustomer(
        userReference: String,
        email: String?,
    ): String

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

    /** One page of a customer's payments newest-first, paging by the opaque `from` cursor (a payment id); [limit] is clamped by the caller. */
    suspend fun listCustomerPayments(
        customerId: String,
        from: String?,
        limit: Int,
    ): MolliePaymentPage

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

    /** Every subscription across the organization (auto-paginated); the reconciliation backstop filters these by provider status. */
    suspend fun listAllSubscriptions(): List<MollieSubscription>

    /** Cancel at the provider. Throws [MollieResourceGoneException] when the subscription is already gone/cancelled. */
    suspend fun cancelSubscription(
        customerId: String,
        subscriptionId: String,
    )
}
