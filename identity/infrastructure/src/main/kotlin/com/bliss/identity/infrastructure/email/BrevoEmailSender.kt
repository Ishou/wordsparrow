package com.bliss.identity.infrastructure.email

import com.bliss.identity.application.ports.EmailSender
import com.bliss.identity.domain.auth.OtpCode
import com.bliss.identity.domain.user.EmailAddress
import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable

class EmailSendFailed(
    val httpStatus: Int,
) : RuntimeException("Brevo transactional email send failed with HTTP $httpStatus")

/** Delivers OTP codes via Brevo's transactional email API (POST /v3/smtp/email); no vendor SDK — Ktor client only. */
class BrevoEmailSender(
    engine: HttpClientEngine,
    private val config: BrevoConfig,
) : EmailSender {
    private val httpClient =
        HttpClient(engine) {
            expectSuccess = false // non-2xx handled via explicit status check in sendOtp()
            install(ContentNegotiation) { json() }
        }

    override suspend fun sendOtp(
        to: EmailAddress,
        code: OtpCode,
    ) {
        val response: HttpResponse =
            httpClient.post(ENDPOINT) {
                header("api-key", config.apiKey)
                header("accept", ContentType.Application.Json.toString())
                contentType(ContentType.Application.Json)
                setBody(
                    BrevoEmailRequest(
                        sender = BrevoSender(name = config.senderName, email = config.senderEmail),
                        to = listOf(BrevoRecipient(email = to.value)),
                        subject = SUBJECT,
                        htmlContent = htmlBody(code),
                        textContent = textBody(code),
                    ),
                )
            }
        if (response.status.value !in 200..299) {
            throw EmailSendFailed(response.status.value)
        }
    }

    private fun textBody(code: OtpCode): String = "Voici ton code : ${code.value} (valable 10 minutes)."

    private fun htmlBody(code: OtpCode): String =
        "<p>Voici ton code de connexion WordSparrow&nbsp;: <strong>${code.value}</strong> (valable 10 minutes).</p>"

    private companion object {
        const val ENDPOINT = "https://api.brevo.com/v3/smtp/email"
        const val SUBJECT = "Ton code de connexion WordSparrow"
    }
}

@Serializable
private data class BrevoEmailRequest(
    val sender: BrevoSender,
    val to: List<BrevoRecipient>,
    val subject: String,
    val htmlContent: String,
    val textContent: String,
)

@Serializable
private data class BrevoSender(
    val name: String,
    val email: String,
)

@Serializable
private data class BrevoRecipient(
    val email: String,
)
