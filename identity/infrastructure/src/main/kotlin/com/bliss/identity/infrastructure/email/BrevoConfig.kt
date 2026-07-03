package com.bliss.identity.infrastructure.email

// Lives in infrastructure (not api): the BrevoEmailSender adapter consumes it and api must not be imported downward.
data class BrevoConfig(
    val apiKey: String,
    val senderEmail: String,
    val senderName: String,
)
