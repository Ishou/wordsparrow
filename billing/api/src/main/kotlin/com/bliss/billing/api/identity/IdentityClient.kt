package com.bliss.billing.api.identity

import com.bliss.billing.api.auth.SESSION_COOKIE_NAME
import com.bliss.billing.api.auth.SessionPrincipal
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

// Identity-api whoami client (ADR-0044 §5): verifies the session cookie over HTTP, no cross-context import. Null for any non-OK response.
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
        if (engine != null) HttpClient(engine) { configure() } else HttpClient(CIO) { configure() }

    private fun io.ktor.client.HttpClientConfig<*>.configure() {
        install(ContentNegotiation) { json(json) }
        expectSuccess = false
    }

    suspend fun verifySession(cookieValue: String?): SessionPrincipal? {
        if (cookieValue.isNullOrBlank()) return null
        val response =
            client.get("$baseUrl/v1/auth/whoami") {
                header(HttpHeaders.Cookie, "$SESSION_COOKIE_NAME=$cookieValue")
            }
        if (response.status != HttpStatusCode.OK) return null
        val body = response.body<WhoAmIDto>()
        val userId = runCatching { UUID.fromString(body.userId) }.getOrNull() ?: return null
        // Absent capabilities => empty set; the gate only denies, so a missing capability never escalates (ADR-0078).
        return SessionPrincipal(userId = userId, capabilities = body.capabilities?.toSet() ?: emptySet())
    }

    // The verified player email from /me, passed through to the provider customer for receipts (ADR-0082); best-effort, null on any non-OK or network failure.
    suspend fun fetchEmail(cookieValue: String?): String? {
        if (cookieValue.isNullOrBlank()) return null
        return runCatching {
            val response =
                client.get("$baseUrl/v1/users/me") {
                    header(HttpHeaders.Cookie, "$SESSION_COOKIE_NAME=$cookieValue")
                }
            if (response.status != HttpStatusCode.OK) return@runCatching null
            response.body<MeDto>().email
        }.getOrNull()
    }

    fun close() {
        client.close()
    }
}

@Serializable
internal data class WhoAmIDto(
    val userId: String,
    val displayName: String? = null,
    val capabilities: List<String>? = null,
)

@Serializable
internal data class MeDto(
    val email: String? = null,
)
