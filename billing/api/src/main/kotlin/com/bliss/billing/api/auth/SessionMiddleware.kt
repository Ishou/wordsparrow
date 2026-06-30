package com.bliss.billing.api.auth

import io.ktor.server.application.createApplicationPlugin
import io.ktor.server.request.ApplicationRequest
import io.ktor.util.AttributeKey
import java.util.UUID

// Matches identity-api's `__Secure-ws_session` cookie (ADR-0044).
const val SESSION_COOKIE_NAME: String = "__Secure-ws_session"

// The verified caller; `role` is the ADR-0060 whoami role, gating maintainer-only routes (ADR-0078 test phase).
data class SessionPrincipal(
    val userId: UUID,
    val role: String,
) {
    val isMaintainer: Boolean get() = role == MAINTAINER_ROLE

    companion object {
        const val MAINTAINER_ROLE: String = "maintainer"
    }
}

// Absent on anonymous requests; guarded routes respond 401/403 themselves (the gate only denies, ADR-0078).
val PrincipalKey: AttributeKey<SessionPrincipal> = AttributeKey("billing.principal")

class SessionMiddlewareConfig {
    // Defaults to null so routing tests can install the plugin without wiring identity-api.
    var verifySession: suspend (String) -> SessionPrincipal? = { null }
}

// Auth-optional: sets PrincipalKey when the cookie verifies; never short-circuits (routes decide 401/403).
val SessionMiddleware =
    createApplicationPlugin(
        name = "BillingSessionMiddleware",
        createConfiguration = ::SessionMiddlewareConfig,
    ) {
        val verify = pluginConfig.verifySession
        onCall { call ->
            val cookie = call.request.sessionCookie()
            if (!cookie.isNullOrBlank()) {
                verify(cookie)?.let { call.attributes.put(PrincipalKey, it) }
            }
        }
    }

private fun ApplicationRequest.sessionCookie(): String? = cookies[SESSION_COOKIE_NAME]
