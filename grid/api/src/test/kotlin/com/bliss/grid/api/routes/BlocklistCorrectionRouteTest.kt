package com.bliss.grid.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import com.bliss.grid.api.auth.SessionMiddleware
import com.bliss.grid.application.auth.WhoAmI
import com.bliss.grid.application.correction.BlocklistPreview
import com.bliss.grid.application.correction.RecordCorrectionUseCase
import com.bliss.grid.domain.correction.ClueCorrection
import com.bliss.grid.infrastructure.persistence.InMemoryBlocklistPreviewQuery
import com.bliss.grid.infrastructure.persistence.InMemoryCorrectionRepository
import com.bliss.grid.infrastructure.persistence.InMemoryWordRepository
import io.ktor.client.request.cookie
import io.ktor.client.request.get
import io.ktor.client.request.headers
import io.ktor.client.request.post
import io.ktor.client.request.setBody
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
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Test
import java.util.UUID

class BlocklistCorrectionRouteTest {
    private val userId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6d")
    private val maintainerCookie = "maintainer-session"

    private val words =
        InMemoryWordRepository(
            listOf(
                com.bliss.grid.domain.model
                    .Word("GROSMOT", "Une definition"),
            ),
        )

    private fun io.ktor.server.testing.ApplicationTestBuilder.mount(
        capabilities: Set<String>,
        repo: InMemoryCorrectionRepository = InMemoryCorrectionRepository(),
        previews: Map<String, BlocklistPreview> = emptyMap(),
    ) {
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
            val record = RecordCorrectionUseCase(repo, words)
            routing { blocklistCorrections(record, InMemoryBlocklistPreviewQuery(previews)) }
        }
    }

    @Test
    fun `blocklist returns 403 when the session lacks admin signalements`() =
        testApplication {
            mount(capabilities = emptySet())
            val response =
                client.post("/v1/corrections/blocklist-word") {
                    cookie("__Secure-ws_session", maintainerCookie)
                    headers { append(HttpHeaders.ContentType, ContentType.Application.Json.toString()) }
                    setBody("""{"wordText":"GROSMOT"}""")
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.Forbidden)
            assertThat(response.bodyAsText()).contains("capability-required")
        }

    @Test
    fun `preview returns 403 when the session lacks admin signalements`() =
        testApplication {
            mount(capabilities = emptySet())
            val response =
                client.get("/v1/corrections/blocklist-preview?word=GROSMOT") {
                    cookie("__Secure-ws_session", maintainerCookie)
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.Forbidden)
            assertThat(response.bodyAsText()).contains("capability-required")
        }

    @Test
    fun `blocklist records a blocklist_word row and returns 202 pending`() =
        testApplication {
            val repo = InMemoryCorrectionRepository()
            mount(capabilities = setOf("admin:signalements"), repo = repo)
            val response =
                client.post("/v1/corrections/blocklist-word") {
                    cookie("__Secure-ws_session", maintainerCookie)
                    headers { append(HttpHeaders.ContentType, ContentType.Application.Json.toString()) }
                    setBody("""{"wordText":"grosmot","reason":"Injure"}""")
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.Accepted)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(body["backfillStatus"]!!.jsonPrimitive.content).isEqualTo("pending")
            UUID.fromString(body["correctionId"]!!.jsonPrimitive.content)
            val recorded = repo.active().single()
            assertThat(recorded.kind).isEqualTo(ClueCorrection.Kind.BLOCKLIST_WORD)
            assertThat(recorded.wordText).isEqualTo("grosmot")
        }

    @Test
    fun `blocklist returns 400 for a blank wordText`() =
        testApplication {
            mount(capabilities = setOf("admin:signalements"))
            val response =
                client.post("/v1/corrections/blocklist-word") {
                    cookie("__Secure-ws_session", maintainerCookie)
                    headers { append(HttpHeaders.ContentType, ContentType.Application.Json.toString()) }
                    setBody("""{"wordText":"   "}""")
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(response.bodyAsText()).contains("invalid-blocklist")
        }

    @Test
    fun `preview returns the affected-grid counts`() =
        testApplication {
            mount(
                capabilities = setOf("admin:signalements"),
                previews = mapOf("GROSMOT" to BlocklistPreview(affectedDailies = 3, affectedSolo = 12)),
            )
            val response =
                client.get("/v1/corrections/blocklist-preview?word=grosmot") {
                    cookie("__Secure-ws_session", maintainerCookie)
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(body["affectedDailies"]!!.jsonPrimitive.content.toInt()).isEqualTo(3)
            assertThat(body["affectedSolo"]!!.jsonPrimitive.content.toInt()).isEqualTo(12)
        }

    @Test
    fun `preview returns 400 when the word parameter is missing`() =
        testApplication {
            mount(capabilities = setOf("admin:signalements"))
            val response =
                client.get("/v1/corrections/blocklist-preview") {
                    cookie("__Secure-ws_session", maintainerCookie)
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(response.bodyAsText()).contains("invalid-blocklist")
        }
}
