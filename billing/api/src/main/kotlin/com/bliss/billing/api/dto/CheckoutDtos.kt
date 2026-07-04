package com.bliss.billing.api.dto

import kotlinx.serialization.Serializable

// userId is session-derived, never the body (ADR-0078 IDOR guard). cadence is optional; the server defaults to monthly (ADR-0080 expand phase). consent is optional in this expand phase — existing callers omit it (ADR-0094).
@Serializable
data class CheckoutSessionRequest(
    val tier: String,
    val cadence: String? = null,
    val consent: CheckoutConsentDto? = null,
)

// Pre-contractual consent captured at checkout (ADR-0094; CGV Art. 1, 7, 13). cgvAccepted must be true or the request is rejected with a 400.
@Serializable
data class CheckoutConsentDto(
    val cgvAccepted: Boolean,
    val cgvVersion: String,
    val withdrawalWaiver: Boolean,
)

@Serializable
data class CheckoutSessionResponse(
    val checkoutUrl: String,
    val successUrl: String,
    val cancelUrl: String,
)
