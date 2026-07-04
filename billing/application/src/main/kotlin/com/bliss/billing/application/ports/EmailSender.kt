package com.bliss.billing.application.ports

/** A pre-composed transactional email with HTML plus a plain-text alternative. */
data class OutboundEmail(
    val to: String,
    val subject: String,
    val htmlBody: String,
    val textBody: String,
)

/** Generic transactional email port (ADR-0094 §2). Billing's legally-mandated mail carries no send-budget/cost cap, unlike identity's OTP path. */
fun interface EmailSender {
    suspend fun send(email: OutboundEmail)
}
