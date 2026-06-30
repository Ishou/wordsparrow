package com.bliss.billing.api.dto

import kotlinx.serialization.Serializable

// userId is session-derived, never the body (ADR-0078 IDOR guard).
@Serializable
data class CheckoutSessionRequest(
    val tier: String,
)

@Serializable
data class CheckoutSessionResponse(
    val checkoutUrl: String,
    val successUrl: String,
    val cancelUrl: String,
)
