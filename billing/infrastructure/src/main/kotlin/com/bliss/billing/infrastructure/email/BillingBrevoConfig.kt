package com.bliss.billing.infrastructure.email

/** Brevo credentials for billing's own transactional sender (ADR-0094 §2); a dedicated sender identity keeps OTP volume from starving legal mail. */
data class BillingBrevoConfig(
    val apiKey: String,
    val senderEmail: String,
    val senderName: String,
)
