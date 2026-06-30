package com.bliss.survey.api.auth

import io.ktor.server.application.createApplicationPlugin
import io.ktor.server.request.ApplicationRequest
import io.ktor.util.AttributeKey
import java.util.UUID

// Matches identity-api's `__Secure-ws_session` cookie (ADR-0044, 2026-05-18 amendment).
const val SESSION_COOKIE_NAME: String = "__Secure-ws_session"

// Maintainer-only capability gating the contribuer surface; identity grants it (ADR-0079), survey only checks it.
const val CONTRIBUER_CAPABILITY: String = "contribuer"

// The verified caller; capabilities come from identity's whoami (ADR-0079), survey derives none.
data class SessionPrincipal(
    val userId: UUID,
    val capabilities: Set<String>,
) {
    fun hasCapability(capability: String): Boolean = capability in capabilities
}

// Absent on anonymous requests; guarded routes respond 401 themselves (ADR-0056 §5).
val UserIdKey: AttributeKey<UUID> = AttributeKey("survey.userId")

// Absent on anonymous requests; the contribuer guard reads it and denies when the capability is missing (ADR-0079).
val CapabilitiesKey: AttributeKey<Set<String>> = AttributeKey("survey.capabilities")

class SessionMiddlewareConfig {
    // Defaults to null so routing tests can install the plugin without wiring identity-api.
    var verifySession: suspend (String) -> SessionPrincipal? = { null }
}

// Auth-optional: sets the principal attributes when the cookie verifies; never short-circuits (ADR-0056).
val SessionMiddleware =
    createApplicationPlugin(
        name = "SurveySessionMiddleware",
        createConfiguration = ::SessionMiddlewareConfig,
    ) {
        val verify = pluginConfig.verifySession
        onCall { call ->
            val cookie = call.request.sessionCookie()
            if (!cookie.isNullOrBlank()) {
                verify(cookie)?.let { principal ->
                    call.attributes.put(UserIdKey, principal.userId)
                    call.attributes.put(CapabilitiesKey, principal.capabilities)
                }
            }
        }
    }

private fun ApplicationRequest.sessionCookie(): String? = cookies[SESSION_COOKIE_NAME]
