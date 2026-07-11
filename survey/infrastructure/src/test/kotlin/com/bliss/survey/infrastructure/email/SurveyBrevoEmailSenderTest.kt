package com.bliss.survey.infrastructure.email

import assertk.assertFailure
import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.doesNotContain
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import com.bliss.survey.application.ports.OutboundEmail
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test

class SurveyBrevoEmailSenderTest {
    private val config =
        SurveyBrevoConfig(
            apiKey = "xkeysib-test-key",
            senderEmail = "signalement@wordsparrow.io",
            senderName = "WordSparrow – Signalement",
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
    ): SurveyBrevoEmailSender {
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
        return SurveyBrevoEmailSender(engine, config)
    }

    private val email =
        OutboundEmail(
            to = "maintainer@wordsparrow.io",
            subject = "Signalement — mot_offensant : CHAT",
            textBody = "Un joueur a signale un probleme.",
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
            assertThat(request.body).contains("\"email\":\"maintainer@wordsparrow.io\"")
            assertThat(request.body).contains("signalement@wordsparrow.io")
            assertThat(request.body).contains("Signalement")
        }

    @Test
    fun `send omits htmlContent when the email has no html body`() =
        runTest {
            val captured = mutableListOf<CapturedRequest>()

            senderWith(captured).send(email)

            assertThat(captured.single().body).doesNotContain("htmlContent")
        }

    @Test
    fun `send throws on a non-2xx response`() =
        runTest {
            assertFailure {
                senderWith(mutableListOf(), status = HttpStatusCode.Unauthorized).send(email)
            }.isInstanceOf(SurveyEmailSendFailed::class)
        }
}
