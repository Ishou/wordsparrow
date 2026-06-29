package com.bliss.billing.api.dto

import kotlinx.serialization.Serializable

// POST /v1/checkout-session request — only the target tier; userId is session-derived (ADR-0078 threat model).
@Serializable
data class CheckoutSessionRequest(
    val tier: String,
)

// POST /v1/checkout-session 201 response — hosted-checkout redirect plus the success/cancel return URLs.
@Serializable
data class CheckoutSessionResponse(
    val checkoutUrl: String,
    val successUrl: String,
    val cancelUrl: String,
)
