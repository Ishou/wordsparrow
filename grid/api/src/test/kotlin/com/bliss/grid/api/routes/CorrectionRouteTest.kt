package com.bliss.grid.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import assertk.assertions.startsWith
import com.bliss.grid.api.auth.SessionMiddleware
import com.bliss.grid.application.auth.WhoAmI
import com.bliss.grid.application.correction.RecordCorrectionUseCase
import com.bliss.grid.infrastructure.persistence.InMemoryCorrectionRepository
import com.bliss.grid.infrastructure.persistence.InMemoryWordRepository
import io.ktor.client.request.cookie
import io.ktor.client.request.get
import io.ktor.client.request.headers
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Test
import java.util.UUID

class CorrectionRouteTest {
    private val userId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6d")
    private val maintainerCookie = "maintainer-session"

    private val words =
        InMemoryWordRepository(
            listOf(
                com.bliss.grid.domain.model
                    .Word("PARIS", "Capitale de la Fance"),
                com.bliss.grid.domain.model
                    .Word("CHAT", "felin domestique"),
            ),
        )

    private fun io.ktor.server.testing.ApplicationTestBuilder.mount(capabilities: Set<String>) {
        application {
            install(ContentNegotiation) {
                json(
                    Json {
                        ignoreUnknownKeys = true
                        explicitNulls = false
                    },
                )
            }
            install(SessionMiddleware) {
                verify = { cookie -> if (cookie == maintainerCookie) WhoAmI(userId, "Mainteneuse", capabilities) else null }
            }
            val correctionRepo = InMemoryCorrectionRepository()
            val record = RecordCorrectionUseCase(correctionRepo, words)
            routing { corrections(record, correctionRepo) }
        }
    }

    private suspend fun submit(
        client: io.ktor.client.HttpClient,
        body: String,
        cookie: String? = maintainerCookie,
    ): HttpResponse =
        client.post("/v1/corrections") {
            if (cookie != null) cookie("__Secure-ws_session", cookie)
            headers { append(HttpHeaders.ContentType, ContentType.Application.Json.toString()) }
            setBody(body)
        }

    @Test
    fun `returns 403 when the session lacks admin signalements`() =
        testApplication {
            mount(capabilities = emptySet())
            val response =
                submit(client, """{"kind":"replace","oldClueText":"Capitale de la Fance","newClueText":"Capitale de la France"}""")
            assertThat(response.status).isEqualTo(HttpStatusCode.Forbidden)
            assertThat(response.bodyAsText()).contains("capability-required")
        }

    @Test
    fun `records a valid replace and returns 202 pending`() =
        testApplication {
            mount(capabilities = setOf("admin:signalements"))
            val response =
                submit(
                    client,
                    """{"kind":"replace","oldClueText":"Capitale de la Fance","wordText":"PARIS","newClueText":"Capitale de la France"}""",
                )

            assertThat(response.status).isEqualTo(HttpStatusCode.Accepted)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(body["backfillStatus"]!!.jsonPrimitive.content).isEqualTo("pending")
            // correctionId is a parseable UUID.
            UUID.fromString(body["correctionId"]!!.jsonPrimitive.content)
        }

    @Test
    fun `rejects a forbid of the only clue with 409 last-clue-forbidden`() =
        testApplication {
            mount(capabilities = setOf("admin:signalements"))
            val response = submit(client, """{"kind":"forbid_clue","oldClueText":"felin domestique","wordText":"CHAT"}""")

            assertThat(response.status).isEqualTo(HttpStatusCode.Conflict)
            assertThat(response.headers["Content-Type"]!!).startsWith("application/problem+json")
            assertThat(response.bodyAsText()).contains("last-clue-forbidden")
        }

    @Test
    fun `returns 400 for an unknown kind`() =
        testApplication {
            mount(capabilities = setOf("admin:signalements"))
            val response = submit(client, """{"kind":"blocklist_word","oldClueText":"x"}""")
            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(response.bodyAsText()).contains("invalid-correction")
        }

    @Test
    fun `GET progress returns 200 for a recorded correction`() =
        testApplication {
            mount(capabilities = setOf("admin:signalements"))
            val recorded =
                submit(client, """{"kind":"replace","oldClueText":"Capitale de la Fance","newClueText":"Capitale de la France"}""")
            val correctionId =
                Json
                    .parseToJsonElement(recorded.bodyAsText())
                    .jsonObject["correctionId"]!!
                    .jsonPrimitive.content

            val response =
                client.get("/v1/corrections/$correctionId") { cookie("__Secure-ws_session", maintainerCookie) }

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(body["backfillStatus"]!!.jsonPrimitive.content).isEqualTo("pending")
            assertThat(body["gridsPatched"]!!.jsonPrimitive.content.toInt()).isEqualTo(0)
            // Required-and-nullable: present on the wire as null while pending (ADR-0003 §6).
            assertThat(body["gridsMatched"]).isEqualTo(JsonNull)
        }

    @Test
    fun `GET progress returns 404 for an unknown id`() =
        testApplication {
            mount(capabilities = setOf("admin:signalements"))
            val response =
                client.get("/v1/corrections/${UUID.randomUUID()}") { cookie("__Secure-ws_session", maintainerCookie) }
            assertThat(response.status).isEqualTo(HttpStatusCode.NotFound)
            assertThat(response.bodyAsText()).contains("correction-not-found")
        }
}
