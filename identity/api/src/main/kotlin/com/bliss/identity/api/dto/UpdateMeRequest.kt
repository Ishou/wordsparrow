package com.bliss.identity.api.dto

import kotlinx.serialization.Serializable

// PATCH /v1/users/me request body, per openapi.yaml UserUpdate schema; absence = no change.
@Serializable
data class UpdateMeRequest(
    val displayName: String? = null,
)
