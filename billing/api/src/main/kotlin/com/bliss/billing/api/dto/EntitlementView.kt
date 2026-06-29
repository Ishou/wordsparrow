package com.bliss.billing.api.dto

import kotlinx.serialization.Serializable

// Caller's entitlement projection. periodEnd is always on the wire and null when no current period applies (ADR-0003 §6).
@Serializable
data class EntitlementView(
    val tier: String,
    val status: String,
    val periodEnd: String?,
    val capabilities: List<String>,
)
