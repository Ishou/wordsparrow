package com.bliss.billing.api.identity

import assertk.assertThat
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
    fun `resolves principal with role from whoami`() =
        runTest {
            val engine =
                MockEngine { respond("""{"userId":"$userId","displayName":"Ada","role":"maintainer"}""", HttpStatusCode.OK, jsonHeaders) }
            val principal = IdentityClient("https://auth.example", engine).verifySession("cookie")
            assertThat(principal?.userId).isEqualTo(userId)
            assertThat(principal?.role).isEqualTo("maintainer")
            assertThat(principal?.isMaintainer).isEqualTo(true)
        }

    @Test
    fun `absent role defaults to non-maintainer player`() =
        runTest {
            val engine = MockEngine { respond("""{"userId":"$userId","displayName":"Ada"}""", HttpStatusCode.OK, jsonHeaders) }
            val principal = IdentityClient("https://auth.example", engine).verifySession("cookie")
            assertThat(principal?.role).isEqualTo("player")
            assertThat(principal?.isMaintainer).isEqualTo(false)
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
}
