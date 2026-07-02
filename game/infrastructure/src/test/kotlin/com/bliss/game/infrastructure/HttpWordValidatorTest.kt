package com.bliss.game.infrastructure

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import assertk.assertions.isTrue
import com.bliss.game.domain.Letter
import com.bliss.game.domain.Position
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandler
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.io.IOException
import java.util.UUID

class HttpWordValidatorTest {
    private val baseUrl = "http://grid.test"
    private val jsonHeaders = headersOf("Content-Type", "application/json")
    private val puzzleId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c")
    private val word =
        mapOf(
            Position(0, 3) to Letter('P'),
            Position(0, 4) to Letter('A'),
        )

    private fun validatorOf(
        token: String? = "s3cr3t",
        handler: MockRequestHandler,
    ): HttpWordValidator = HttpWordValidator(HttpClient(MockEngine(handler)), baseUrl, token)

    private fun bodyText(request: HttpRequestData): String =
        when (val body = request.body) {
            is OutgoingContent.ByteArrayContent -> String(body.bytes())
            else -> error("unexpected body type: ${body::class}")
        }

    @Test
    fun `hits the validate-word endpoint with cells and the service token header`() =
        runTest {
            var capturedUrl: String? = null
            var capturedToken: String? = null
            var capturedBody: String? = null
            validatorOf { request ->
                capturedUrl = request.url.toString()
                capturedToken = request.headers[HttpWordValidator.SERVICE_TOKEN_HEADER]
                capturedBody = bodyText(request)
                respond("""{"correct":true}""", HttpStatusCode.OK, jsonHeaders)
            }.isWordCorrect(puzzleId, word)

            assertThat(checkNotNull(capturedUrl)).contains("/v1/puzzles/$puzzleId/validate-word")
            assertThat(capturedToken).isEqualTo("s3cr3t")
            val sent = checkNotNull(capturedBody)
            assertThat(sent).contains("\"cells\"")
            assertThat(sent).contains("\"row\":0")
            assertThat(sent).contains("\"letter\":\"P\"")
        }

    @Test
    fun `correct true parses to true`() =
        runTest {
            val result = validatorOf { respond("""{"correct":true}""", HttpStatusCode.OK, jsonHeaders) }.isWordCorrect(puzzleId, word)
            assertThat(result).isTrue()
        }

    @Test
    fun `correct false parses to false`() =
        runTest {
            val result = validatorOf { respond("""{"correct":false}""", HttpStatusCode.OK, jsonHeaders) }.isWordCorrect(puzzleId, word)
            assertThat(result).isFalse()
        }

    // The regression guard: grid PR #1170 dropped a field game-api still
    // required, silently breaking co-op. A response missing `correct` must fail loud.
    @Test
    fun `response missing correct raises UpstreamMalformed`() =
        runTest {
            assertThrows<WordValidatorException.UpstreamMalformed> {
                validatorOf { respond("""{"solved":true}""", HttpStatusCode.OK, jsonHeaders) }.isWordCorrect(puzzleId, word)
            }
        }

    @Test
    fun `non 2xx response raises UpstreamError carrying status and body`() =
        runTest {
            val ex =
                assertThrows<WordValidatorException.UpstreamError> {
                    validatorOf { respond("unauthorized", HttpStatusCode.Unauthorized, jsonHeaders) }.isWordCorrect(puzzleId, word)
                }
            assertThat(ex.status).isEqualTo(401)
            assertThat(ex.body).contains("unauthorized")
        }

    @Test
    fun `network failure raises UpstreamUnavailable`() =
        runTest {
            val ex =
                assertThrows<WordValidatorException.UpstreamUnavailable> {
                    validatorOf { throw IOException("connection refused") }.isWordCorrect(puzzleId, word)
                }
            assertThat(ex.cause).isNotNull()
        }

    // Boot-safety: no token env in dev/absent-Secret means no header; grid 401s,
    // co-op stays unlocked, never worse (ADR-0084 §3).
    @Test
    fun `omits the service token header when no token is configured`() =
        runTest {
            var capturedToken: String? = "unset"
            validatorOf(token = null) { request ->
                capturedToken = request.headers[HttpWordValidator.SERVICE_TOKEN_HEADER]
                respond("""{"correct":true}""", HttpStatusCode.OK, jsonHeaders)
            }.isWordCorrect(puzzleId, word)
            assertThat(capturedToken).isNull()
        }
}
