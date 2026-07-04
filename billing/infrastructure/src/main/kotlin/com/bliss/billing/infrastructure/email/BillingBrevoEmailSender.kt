package com.bliss.billing.infrastructure.email

import com.bliss.billing.application.ports.EmailSender
import com.bliss.billing.application.ports.OutboundEmail
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

class BillingEmailSendFailed(
    val httpStatus: Int,
) : RuntimeException("Brevo transactional email send failed with HTTP $httpStatus")

/** Delivers billing's legally-mandated transactional email via Brevo (POST /v3/smtp/email); no vendor SDK — Ktor client only (ADR-0094 §2, mirrors identity's adapter). No send budget: this mail must always go out. */
class BillingBrevoEmailSender(
    engine: HttpClientEngine,
    private val config: BillingBrevoConfig,
) : EmailSender {
    private val httpClient =
        HttpClient(engine) {
            expectSuccess = false
            install(ContentNegotiation) { json() }
        }

    override suspend fun send(email: OutboundEmail) {
        val response: HttpResponse =
            httpClient.post(ENDPOINT) {
                header("api-key", config.apiKey)
                header("accept", ContentType.Application.Json.toString())
                contentType(ContentType.Application.Json)
                setBody(
                    BrevoEmailRequest(
                        sender = BrevoSender(name = config.senderName, email = config.senderEmail),
                        to = listOf(BrevoRecipient(email = email.to)),
                        replyTo = BrevoReplyTo(email = config.replyTo),
                        subject = email.subject,
                        htmlContent = email.htmlBody,
                        textContent = email.textBody,
                    ),
                )
            }
        if (response.status.value !in 200..299) {
            throw BillingEmailSendFailed(response.status.value)
        }
    }

    private companion object {
        const val ENDPOINT = "https://api.brevo.com/v3/smtp/email"
    }
}

@Serializable
private data class BrevoEmailRequest(
    val sender: BrevoSender,
    val to: List<BrevoRecipient>,
    val replyTo: BrevoReplyTo,
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

@Serializable
private data class BrevoReplyTo(
    val email: String,
)
