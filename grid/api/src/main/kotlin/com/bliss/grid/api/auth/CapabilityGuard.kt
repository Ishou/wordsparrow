package com.bliss.grid.api.auth

import com.bliss.grid.api.dto.ProblemDetails
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respondText
import kotlinx.serialization.json.Json

// Maintainer-only capability gating the correction routes (ADR-0108); identity grants it (ADR-0079), grid only checks it.
const val ADMIN_SIGNALEMENTS_CAPABILITY: String = "admin:signalements"

// Stable RFC 7807 `type` for a missing-capability denial (ADR-0003 §6, ADR-0108 threat model).
const val CAPABILITY_REQUIRED_TYPE: String = "https://bliss.example/errors/capability-required"

/** Deny-by-default capability gate: responds 403 and returns false when the session lacks [capability] (ADR-0108). */
suspend fun ApplicationCall.requireCapability(capability: String): Boolean {
    val capabilities = attributes.getOrNull(CapabilitiesKey) ?: emptySet()
    if (capability in capabilities) return true
    val problem =
        ProblemDetails(
            type = CAPABILITY_REQUIRED_TYPE,
            title = "Capability required",
            status = HttpStatusCode.Forbidden.value,
            detail = "Cette action est reservee aux mainteneurs.",
            instance = request.local.uri,
        )
    respondText(
        text = Json.encodeToString(ProblemDetails.serializer(), problem),
        contentType = ContentType.parse("application/problem+json"),
        status = HttpStatusCode.Forbidden,
    )
    return false
}
