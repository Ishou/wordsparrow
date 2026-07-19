package com.bliss.grid.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import com.bliss.grid.api.auth.SessionMiddleware
import com.bliss.grid.application.auth.WhoAmI
import com.bliss.grid.domain.correction.ClueCorrection
import io.ktor.client.request.cookie
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

class CorrectionReverseRouteTest {
    private val userId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6d")
    private val maintainerCookie = "maintainer-session"

    private fun io.ktor.server.testing.ApplicationTestBuilder.mount(
        capabilities: Set<String>,
        result: ClueCorrection.Kind? = ClueCorrection.Kind.REPLACE,
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
            routing { correctionReverse { _, _, _ -> result } }
        }
    }

    private suspend fun io.ktor.client.HttpClient.reverse(body: String) =
        post("/v1/corrections/reverse") {
            cookie("__Secure-ws_session", maintainerCookie)
            headers { append(HttpHeaders.ContentType, ContentType.Application.Json.toString()) }
            setBody(body)
        }

    @Test
    fun `reverse returns 403 when the session lacks admin signalements`() =
        testApplication {
            mount(capabilities = emptySet())
            val response = client.reverse("""{"oldClueText":"Animal qui miaule","wordText":"CHAT"}""")
            assertThat(response.status).isEqualTo(HttpStatusCode.Forbidden)
            assertThat(response.bodyAsText()).contains("capability-required")
        }

    @Test
    fun `reverse returns 200 with the reversed kind`() =
        testApplication {
            mount(capabilities = setOf("admin:signalements"), result = ClueCorrection.Kind.BLOCKLIST_WORD)
            val response = client.reverse("""{"oldClueText":"Animal qui miaule","wordText":"CHAT"}""")
            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(body["reversedKind"]!!.jsonPrimitive.content).isEqualTo("blocklist_word")
        }

    @Test
    fun `reverse returns 200 with a null reversedKind when nothing matched`() =
        testApplication {
            mount(capabilities = setOf("admin:signalements"), result = null)
            val response = client.reverse("""{"oldClueText":"Animal qui miaule"}""")
            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.bodyAsText()).contains("\"reversedKind\":null")
        }

    @Test
    fun `reverse returns 400 when oldClueText is blank`() =
        testApplication {
            mount(capabilities = setOf("admin:signalements"))
            val response = client.reverse("""{"oldClueText":"   "}""")
            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(response.bodyAsText()).contains("invalid-correction")
        }
}
