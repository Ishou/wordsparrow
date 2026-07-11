package com.bliss.survey.application.ports

/** A pre-composed transactional email; [htmlBody] is optional since harm alerts are plain text. */
data class OutboundEmail(
    val to: String,
    val subject: String,
    val textBody: String,
    val htmlBody: String? = null,
)

/** Transactional email port (ADR-0103; mirrors identity ADR-0092 / billing ADR-0094). Harm reports notify the maintainer. */
fun interface EmailSender {
    suspend fun send(email: OutboundEmail)
}
