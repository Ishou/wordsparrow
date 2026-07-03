package com.bliss.identity.api.dto

import kotlinx.serialization.Serializable

@Serializable
data class EmailVerifyRequest(
    val email: String,
    val code: String,
)
