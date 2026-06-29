package com.bliss.grid.api.dto

import kotlinx.serialization.Serializable

/** Request for `verifySampleWord` (ADR-0076): an opaque token plus the player's full attempt. */
@Serializable
data class SampleVerifyRequest(
    val token: String,
    val guess: String,
)

/** Result of a teaser guess check (ADR-0076). No plaintext answer is ever returned. */
@Serializable
data class SampleVerifyResult(
    val correct: Boolean,
)
