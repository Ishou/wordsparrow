package com.bliss.billing.infrastructure.provider

import com.bliss.billing.domain.SubscriptionStatus

/** Maps Mollie payment/subscription status strings to the domain lifecycle; `null` means "no actionable subscription state yet" so the caller drops the callback (ADR-0078). */
object MollieStatusMapping {
    fun fromPaymentStatus(value: String): SubscriptionStatus? =
        when (value) {
            "paid", "authorized" -> SubscriptionStatus.ACTIVE
            "failed", "expired" -> SubscriptionStatus.EXPIRED
            "canceled" -> SubscriptionStatus.CANCELED
            "open", "pending" -> null
            else -> null
        }

    fun fromSubscriptionStatus(value: String): SubscriptionStatus? =
        when (value) {
            "active" -> SubscriptionStatus.ACTIVE
            "suspended" -> SubscriptionStatus.PAST_DUE
            "canceled" -> SubscriptionStatus.CANCELED
            "completed" -> SubscriptionStatus.EXPIRED
            "pending" -> null
            else -> null
        }
}
