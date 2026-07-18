package com.bliss.grid.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import com.bliss.grid.api.auth.SessionMiddleware
import com.bliss.grid.application.auth.WhoAmI
import com.bliss.grid.application.correction.CorrectionPreview
import com.bliss.grid.infrastructure.persistence.InMemoryCorrectionPreviewQuery
import io.ktor.client.request.cookie
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
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

class CorrectionPreviewRouteTest {
    private val userId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6d")
    private val maintainerCookie = "maintainer-session"

    private fun io.ktor.server.testing.ApplicationTestBuilder.mount(
        capabilities: Set<String>,
        previews: Map<String, CorrectionPreview> = emptyMap(),
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
            routing { correctionPreview(InMemoryCorrectionPreviewQuery(previews)) }
        }
    }

    @Test
    fun `preview returns 403 when the session lacks admin signalements`() =
        testApplication {
            mount(capabilities = emptySet())
            val response =
                client.get("/v1/corrections/preview?oldClueText=Animal%20qui%20miaule") {
                    cookie("__Secure-ws_session", maintainerCookie)
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.Forbidden)
            assertThat(response.bodyAsText()).contains("capability-required")
        }

    @Test
    fun `preview returns the affected-grid counts`() =
        testApplication {
            mount(
                capabilities = setOf("admin:signalements"),
                previews = mapOf("Animal qui miaule" to CorrectionPreview(affectedDailies = 2, affectedSolo = 40)),
            )
            val response =
                client.get("/v1/corrections/preview?oldClueText=Animal%20qui%20miaule&wordText=chat") {
                    cookie("__Secure-ws_session", maintainerCookie)
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(body["affectedDailies"]!!.jsonPrimitive.content.toInt()).isEqualTo(2)
            assertThat(body["affectedSolo"]!!.jsonPrimitive.content.toInt()).isEqualTo(40)
        }

    @Test
    fun `preview returns 400 when oldClueText is missing`() =
        testApplication {
            mount(capabilities = setOf("admin:signalements"))
            val response =
                client.get("/v1/corrections/preview") {
                    cookie("__Secure-ws_session", maintainerCookie)
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(response.bodyAsText()).contains("invalid-correction")
        }
}
