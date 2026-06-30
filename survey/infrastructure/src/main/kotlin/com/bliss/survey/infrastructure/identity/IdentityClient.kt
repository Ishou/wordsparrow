package com.bliss.survey.infrastructure.identity

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.UUID

/** Identity-API session-verify client (ADR-0044 §5). Returns null for any non-OK response. */
class IdentityClient(
    private val baseUrl: String,
    engine: HttpClientEngine? = null,
) {
    private val json =
        Json {
            ignoreUnknownKeys = true
            explicitNulls = false
        }

    private val client: HttpClient =
        if (engine != null) {
            HttpClient(engine) { configure() }
        } else {
            HttpClient(CIO) { configure() }
        }

    private fun io.ktor.client.HttpClientConfig<*>.configure() {
        install(ContentNegotiation) { json(json) }
        expectSuccess = false
    }

    /** Returns the verified session (user id + capabilities) when the cookie is valid, otherwise null. */
    suspend fun verifySession(cookieValue: String?): VerifiedSession? {
        if (cookieValue.isNullOrBlank()) return null
        val response =
            client.get("$baseUrl/v1/auth/whoami") {
                header(HttpHeaders.Cookie, "$SESSION_COOKIE_NAME=$cookieValue")
            }
        return when (response.status) {
            HttpStatusCode.OK -> {
                val me = response.body<WhoAmIDto>()
                val userId = runCatching { UUID.fromString(me.userId) }.getOrNull() ?: return null
                // Absent capabilities => empty set; the gate only denies, so a missing field never escalates (ADR-0079 §6).
                VerifiedSession(userId = userId, capabilities = me.capabilities?.toSet() ?: emptySet())
            }
            else -> null
        }
    }

    /** Closes the underlying Ktor HttpClient. */
    fun close() {
        client.close()
    }

    companion object {
        const val SESSION_COOKIE_NAME: String = "__Secure-ws_session"
    }
}

// The verified caller; capabilities come from identity's whoami (ADR-0079), survey derives none.
data class VerifiedSession(
    val userId: UUID,
    val capabilities: Set<String>,
)

@Serializable
internal data class WhoAmIDto(
    val userId: String,
    val displayName: String? = null,
    val capabilities: List<String>? = null,
)
