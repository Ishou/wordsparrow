package com.bliss.billing.domain

/** Pre-contractual consent expressed at checkout (ADR-0094; CGV Art. 1, 7, 13). The contract cannot form without CGV acceptance, so cgvAccepted must be true. */
data class CheckoutConsent(
    val cgvAccepted: Boolean,
    val cgvVersion: String,
    val withdrawalWaiver: Boolean,
) {
    init {
        require(cgvAccepted) { "CGV must be accepted for a consent record to exist." }
        require(cgvVersion.isNotBlank()) { "CGV version must not be blank." }
    }
}
