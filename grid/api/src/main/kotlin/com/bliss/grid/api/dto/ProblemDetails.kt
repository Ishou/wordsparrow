package com.bliss.grid.api.dto

import kotlinx.serialization.Serializable

/** RFC 7807 `application/problem+json` body, per ADR-0003 §6 wire conventions. */
@Serializable
data class ProblemDetails(
    val type: String,
    val title: String,
    val status: Int,
    val detail: String? = null,
    val instance: String? = null,
    // RFC 7807 §3.2 extension member; only verify-cooldown-active (ADR-0099) sets it, default Json's encodeDefaults=false keeps it off every other Problem.
    val secondsUntilNextVerify: Int? = null,
)
