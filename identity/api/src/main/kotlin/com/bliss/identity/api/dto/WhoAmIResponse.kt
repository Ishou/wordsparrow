package com.bliss.identity.api.dto

import kotlinx.serialization.Serializable

@Serializable
data class WhoAmIResponse(
    val userId: String,
    val displayName: String,
    val role: String,
    val capabilities: List<String>,
)
