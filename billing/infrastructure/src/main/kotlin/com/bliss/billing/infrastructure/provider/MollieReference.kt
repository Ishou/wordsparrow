package com.bliss.billing.infrastructure.provider

/** Decoded opaque [BillingProviderPort] reference: a bare Mollie payment id, or a `customerId:subscriptionId` composite (Mollie cancel/get need both ids, the port carries one string). */
sealed interface MollieReference {
    data class Payment(
        val paymentId: String,
    ) : MollieReference

    data class Subscription(
        val customerId: String,
        val subscriptionId: String,
    ) : MollieReference

    companion object {
        private const val SEPARATOR = ":"

        fun subscription(
            customerId: String,
            subscriptionId: String,
        ): String = "$customerId$SEPARATOR$subscriptionId"

        // Mollie ids contain no ':', so a single separator unambiguously marks a subscription composite.
        fun decode(externalRef: String): MollieReference {
            val parts = externalRef.split(SEPARATOR, limit = 2)
            return if (parts.size == 2 && parts[0].isNotBlank() && parts[1].isNotBlank()) {
                Subscription(parts[0], parts[1])
            } else {
                Payment(externalRef)
            }
        }
    }
}
