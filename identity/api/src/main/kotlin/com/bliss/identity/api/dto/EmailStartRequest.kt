package com.bliss.identity.api.dto

import kotlinx.serialization.Serializable

@Serializable
data class EmailStartRequest(
    val email: String,
)
