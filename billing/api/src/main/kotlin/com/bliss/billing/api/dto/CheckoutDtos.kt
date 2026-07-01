package com.bliss.billing.api.dto

import kotlinx.serialization.Serializable

// userId is session-derived, never the body (ADR-0078 IDOR guard). cadence is optional; the server defaults to monthly (ADR-0080 expand phase).
@Serializable
data class CheckoutSessionRequest(
    val tier: String,
    val cadence: String? = null,
)

@Serializable
data class CheckoutSessionResponse(
    val checkoutUrl: String,
    val successUrl: String,
    val cancelUrl: String,
)
