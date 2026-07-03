package com.bliss.identity.infrastructure.email

import assertk.assertFailure
import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import com.bliss.identity.domain.auth.OtpCode
import com.bliss.identity.domain.user.EmailAddress
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test

class BrevoEmailSenderTest {
    private val config =
        BrevoConfig(
            apiKey = "xkeysib-test-key",
            senderEmail = "no-reply@wordsparrow.io",
            senderName = "WordSparrow",
        )

    private data class CapturedRequest(
        val method: HttpMethod,
        val url: String,
        val apiKey: String?,
        val contentType: String?,
        val body: String,
    )

    private fun senderWith(
        captured: MutableList<CapturedRequest>,
        status: HttpStatusCode = HttpStatusCode.Created,
    ): BrevoEmailSender {
        val engine =
            MockEngine { request ->
                captured.add(
                    CapturedRequest(
                        method = request.method,
                        url = request.url.toString(),
                        apiKey = request.headers["api-key"],
                        contentType = request.body.contentType?.toString(),
                        body = request.body.toByteArray().toString(Charsets.UTF_8),
                    ),
                )
                respond(
                    content = """{"messageId":"<202607.0@smtp-relay.mailin.fr>"}""",
                    status = status,
                    headers = headersOf("Content-Type", ContentType.Application.Json.toString()),
                )
            }
        return BrevoEmailSender(engine, config)
    }

    @Test
    fun `sendOtp posts the six-digit code to the brevo transactional endpoint`() =
        runTest {
            val captured = mutableListOf<CapturedRequest>()
            val sender = senderWith(captured)

            sender.sendOtp(EmailAddress.of("Alice@Example.com"), OtpCode.of("012345"))

            val request = captured.single()
            assertThat(request.method).isEqualTo(HttpMethod.Post)
            assertThat(request.url).isEqualTo("https://api.brevo.com/v3/smtp/email")
            assertThat(request.apiKey).isEqualTo("xkeysib-test-key")
            assertThat(request.contentType).isEqualTo(ContentType.Application.Json.toString())
            assertThat(request.body).contains("\"email\":\"alice@example.com\"")
            assertThat(request.body).contains("no-reply@wordsparrow.io")
            assertThat(request.body).contains("012345")
        }

    @Test
    fun `sendOtp throws EmailSendFailed on a non-2xx response`() =
        runTest {
            val captured = mutableListOf<CapturedRequest>()
            val sender = senderWith(captured, status = HttpStatusCode.Unauthorized)

            assertFailure {
                sender.sendOtp(EmailAddress.of("bob@example.com"), OtpCode.of("654321"))
            }.isInstanceOf(EmailSendFailed::class)
        }
}
