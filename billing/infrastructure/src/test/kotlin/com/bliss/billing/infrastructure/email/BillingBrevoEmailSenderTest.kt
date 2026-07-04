package com.bliss.billing.infrastructure.email

import assertk.assertFailure
import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import com.bliss.billing.application.ports.OutboundEmail
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test

class BillingBrevoEmailSenderTest {
    private val config =
        BillingBrevoConfig(
            apiKey = "xkeysib-test-key",
            senderEmail = "facturation@wordsparrow.io",
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
    ): BillingBrevoEmailSender {
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
        return BillingBrevoEmailSender(engine, config)
    }

    private val email =
        OutboundEmail(
            to = "joueuse@example.com",
            subject = "Confirmation de ton abonnement WordSparrow",
            htmlBody = "<p>Merci</p>",
            textBody = "Merci",
        )

    @Test
    fun `send posts the email to the brevo transactional endpoint`() =
        runTest {
            val captured = mutableListOf<CapturedRequest>()

            senderWith(captured).send(email)

            val request = captured.single()
            assertThat(request.method).isEqualTo(HttpMethod.Post)
            assertThat(request.url).isEqualTo("https://api.brevo.com/v3/smtp/email")
            assertThat(request.apiKey).isEqualTo("xkeysib-test-key")
            assertThat(request.contentType).isEqualTo(ContentType.Application.Json.toString())
            assertThat(request.body).contains("\"email\":\"joueuse@example.com\"")
            assertThat(request.body).contains("facturation@wordsparrow.io")
            assertThat(request.body).contains("Confirmation de ton abonnement WordSparrow")
        }

    @Test
    fun `send throws on a non-2xx response`() =
        runTest {
            assertFailure {
                senderWith(mutableListOf(), status = HttpStatusCode.Unauthorized).send(email)
            }.isInstanceOf(BillingEmailSendFailed::class)
        }
}
