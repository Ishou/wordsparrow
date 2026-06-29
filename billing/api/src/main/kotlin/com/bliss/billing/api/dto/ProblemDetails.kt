package com.bliss.billing.api.dto

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable

// RFC 7807 problem-detail object (ADR-0003 §6).
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ProblemDetails(
    val type: String,
    val title: String,
    val status: Int,
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val detail: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val instance: String? = null,
)
