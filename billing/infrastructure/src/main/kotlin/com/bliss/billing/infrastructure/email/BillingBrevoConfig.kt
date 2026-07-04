package com.bliss.billing.infrastructure.email

/** Brevo credentials for billing's own transactional sender (ADR-0094 §2); shares identity's Brevo account/key but sends from its own address so receipts are distinct from OTP mail. */
data class BillingBrevoConfig(
    val apiKey: String,
    val senderEmail: String,
    val senderName: String,
    val replyTo: String,
)
