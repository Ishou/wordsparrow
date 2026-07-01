package com.bliss.billing.api.identity

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.util.UUID

class IdentityClientTest {
    private val userId = UUID.fromString("55555555-5555-7555-8555-555555555555")
    private val jsonHeaders = headersOf(HttpHeaders.ContentType, "application/json")

    @Test
    fun `resolves principal with capabilities from whoami`() =
        runTest {
            val engine =
                MockEngine {
                    respond(
                        """{"userId":"$userId","displayName":"Ada","capabilities":["billing:subscribe"]}""",
                        HttpStatusCode.OK,
                        jsonHeaders,
                    )
                }
            val principal = IdentityClient("https://auth.example", engine).verifySession("cookie")
            assertThat(principal?.userId).isEqualTo(userId)
            assertThat(principal?.capabilities ?: emptySet()).contains("billing:subscribe")
        }

    @Test
    fun `absent capabilities default to an empty set`() =
        runTest {
            val engine = MockEngine { respond("""{"userId":"$userId","displayName":"Ada"}""", HttpStatusCode.OK, jsonHeaders) }
            val principal = IdentityClient("https://auth.example", engine).verifySession("cookie")
            assertThat(principal?.capabilities ?: setOf("x")).isEmpty()
        }

    @Test
    fun `non-OK whoami yields null`() =
        runTest {
            val engine = MockEngine { respond("", HttpStatusCode.Unauthorized) }
            assertThat(IdentityClient("https://auth.example", engine).verifySession("cookie")).isNull()
        }

    @Test
    fun `blank cookie short-circuits to null`() =
        runTest {
            val engine = MockEngine { respond("", HttpStatusCode.OK) }
            assertThat(IdentityClient("https://auth.example", engine).verifySession(null)).isNull()
        }

    @Test
    fun `fetches the player email from me`() =
        runTest {
            val engine = MockEngine { respond("""{"email":"ada@example.com"}""", HttpStatusCode.OK, jsonHeaders) }
            assertThat(IdentityClient("https://auth.example", engine).fetchEmail("cookie")).isEqualTo("ada@example.com")
        }

    @Test
    fun `absent email field on me yields null`() =
        runTest {
            val engine = MockEngine { respond("""{"displayName":"Ada"}""", HttpStatusCode.OK, jsonHeaders) }
            assertThat(IdentityClient("https://auth.example", engine).fetchEmail("cookie")).isNull()
        }

    @Test
    fun `non-OK me yields null email`() =
        runTest {
            val engine = MockEngine { respond("", HttpStatusCode.Unauthorized) }
            assertThat(IdentityClient("https://auth.example", engine).fetchEmail("cookie")).isNull()
        }

    @Test
    fun `blank cookie short-circuits email to null`() =
        runTest {
            val engine = MockEngine { respond("", HttpStatusCode.OK) }
            assertThat(IdentityClient("https://auth.example", engine).fetchEmail(null)).isNull()
        }

    @Test
    fun `identity network fault yields null email instead of propagating`() =
        runTest {
            val engine = MockEngine { throw java.io.IOException("connection reset") }
            assertThat(IdentityClient("https://auth.example", engine).fetchEmail("cookie")).isNull()
        }
}
