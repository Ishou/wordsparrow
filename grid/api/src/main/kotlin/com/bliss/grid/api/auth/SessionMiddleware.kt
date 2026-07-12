package com.bliss.grid.api.auth

import com.bliss.grid.application.auth.WhoAmI
import io.ktor.server.application.createApplicationPlugin
import io.ktor.server.request.ApplicationRequest
import io.ktor.util.AttributeKey
import java.util.UUID

// Matches identity-api's session cookie (ADR-0044); grid already reads it on the hint path.
const val SESSION_COOKIE_NAME: String = "__Secure-ws_session"

// Present only on verified requests; absent means anonymous — the guard denies by default (ADR-0079).
val UserIdKey: AttributeKey<UUID> = AttributeKey("grid.userId")
val CapabilitiesKey: AttributeKey<Set<String>> = AttributeKey("grid.capabilities")

class SessionMiddlewareConfig {
    // Defaults to no verification so route tests can install the plugin without wiring identity-api.
    var verify: suspend (String?) -> WhoAmI? = { null }
}

// Auth-optional (ADR-0056): stashes the principal when the cookie verifies; never short-circuits.
val SessionMiddleware =
    createApplicationPlugin(
        name = "GridSessionMiddleware",
        createConfiguration = ::SessionMiddlewareConfig,
    ) {
        val verify = pluginConfig.verify
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
