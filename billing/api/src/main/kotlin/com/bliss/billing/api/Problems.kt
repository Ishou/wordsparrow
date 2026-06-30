package com.bliss.billing.api

import com.bliss.billing.api.auth.PrincipalKey
import com.bliss.billing.api.auth.SessionPrincipal
import com.bliss.billing.api.dto.ProblemDetails
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respondText

// Stable RFC 7807 `type` URIs per the billing contract (ADR-0003 §6, billing/api/openapi.yaml).
internal object ProblemTypes {
    const val AUTH_REQUIRED = "https://bliss.example/errors/auth-required"
    const val FORBIDDEN = "https://bliss.example/errors/forbidden"
    const val INVALID_CHECKOUT_REQUEST = "https://bliss.example/errors/invalid-checkout-request"
    const val ALREADY_SUBSCRIBED = "https://bliss.example/errors/already-subscribed"
    const val NO_ACTIVE_SUBSCRIPTION = "https://bliss.example/errors/no-active-subscription"
    const val PROVIDER_UNAVAILABLE = "https://bliss.example/errors/provider-unavailable"
    const val INVALID_WEBHOOK_BODY = "https://bliss.example/errors/invalid-webhook-body"
}

// Responds with RFC 7807 application/problem+json, bypassing ContentNegotiation which would produce application/json.
internal suspend fun ApplicationCall.respondProblem(
    status: HttpStatusCode,
    type: String,
    title: String,
    detail: String? = null,
) = respondText(
    text =
        WIRE_JSON.encodeToString(
            ProblemDetails.serializer(),
            ProblemDetails(type = type, title = title, status = status.value, detail = detail),
        ),
    contentType = ContentType.parse("application/problem+json"),
    status = status,
)

// Resolves the authed caller or responds 401; for self-scoped reads (subscription) any authenticated caller passes.
internal suspend fun ApplicationCall.requireSession(): SessionPrincipal? {
    val principal = attributes.getOrNull(PrincipalKey)
    if (principal == null) {
        respondProblem(HttpStatusCode.Unauthorized, ProblemTypes.AUTH_REQUIRED, "authentication required")
    }
    return principal
}

// The capability gate (ADR-0078 amendment): 401 when anonymous, 403 when authed but lacking the capability. Only ever denies.
internal suspend fun ApplicationCall.requireCapability(capability: String): SessionPrincipal? {
    val principal = requireSession() ?: return null
    if (!principal.hasCapability(capability)) {
        respondProblem(HttpStatusCode.Forbidden, ProblemTypes.FORBIDDEN, "missing required capability")
        return null
    }
    return principal
}
