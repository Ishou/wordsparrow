package com.bliss.billing.api.dto

import kotlinx.serialization.Serializable

// The caller's subscription status. periodEnd is always on the wire and null when no current period applies (ADR-0003 §6).
@Serializable
data class SubscriptionView(
    val tier: String,
    val status: String,
    val periodEnd: String?,
)
