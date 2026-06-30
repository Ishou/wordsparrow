package com.bliss.survey.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import com.bliss.survey.api.WIRE_JSON
import com.bliss.survey.api.auth.SESSION_COOKIE_NAME
import com.bliss.survey.application.usecases.UndoActionResult
import com.bliss.survey.domain.model.UserId
import io.ktor.client.request.cookie
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import org.junit.jupiter.api.Test
import java.util.UUID

class UndoActionRouteTest {
    private val userUuid = UUID.fromString("33333333-3333-7333-8333-333333333333")

    @Test
    fun `maintainer - undone - 204 no content`() =
        testApplication {
            application {
                installCapabilitySession()
                install(ContentNegotiation) { json(WIRE_JSON) }
                routing { undoActionRoute { _, _ -> UndoActionResult.Undone } }
            }
            val resp =
                client.post("/v1/actions/undo") {
                    cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE)
                    contentType(ContentType.Application.Json)
                    setBody("{\"token\":\"undo-tok\"}")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.NoContent)
        }

    @Test
    fun `maintainer - not found - 404 problem details`() =
        testApplication {
            application {
                installCapabilitySession()
                install(ContentNegotiation) { json(WIRE_JSON) }
                routing { undoActionRoute { _, _ -> UndoActionResult.NotFound } }
            }
            val resp =
                client.post("/v1/actions/undo") {
                    cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE)
                    contentType(ContentType.Application.Json)
                    setBody("{\"token\":\"unknown\"}")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.NotFound)
            assertThat(resp.bodyAsText()).contains("action not found")
        }

    @Test
    fun `maintainer - expired - 410 gone`() =
        testApplication {
            application {
                installCapabilitySession()
                install(ContentNegotiation) { json(WIRE_JSON) }
                routing { undoActionRoute { _, _ -> UndoActionResult.Expired } }
            }
            val resp =
                client.post("/v1/actions/undo") {
                    cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE)
                    contentType(ContentType.Application.Json)
                    setBody("{\"token\":\"stale-tok\"}")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Gone)
            assertThat(resp.bodyAsText()).contains("undo window expired")
        }

    @Test
    fun `maintainer - token read from body not path`() =
        testApplication {
            var seenToken: String? = null
            application {
                installCapabilitySession()
                install(ContentNegotiation) { json(WIRE_JSON) }
                routing {
                    undoActionRoute { token, _ ->
                        seenToken = token
                        UndoActionResult.Undone
                    }
                }
            }
            client.post("/v1/actions/undo") {
                cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE)
                contentType(ContentType.Application.Json)
                setBody("{\"token\":\"body-token\"}")
            }
            assertThat(seenToken).isEqualTo("body-token")
        }

    @Test
    fun `maintainer - session user id forwarded to use case`() =
        testApplication {
            var seenUser: UserId? = null
            application {
                installCapabilitySession(userUuid)
                install(ContentNegotiation) { json(WIRE_JSON) }
                routing {
                    undoActionRoute { _, userId ->
                        seenUser = userId
                        UndoActionResult.Undone
                    }
                }
            }
            client.post("/v1/actions/undo") {
                cookie(SESSION_COOKIE_NAME, "valid-token")
                contentType(ContentType.Application.Json)
                setBody("{\"token\":\"body-token\"}")
            }
            assertThat(seenUser).isEqualTo(UserId(userUuid))
        }

    // ADR-0079: contribuer is maintainer-only; non-maintainer callers are denied 403.
    @Test
    fun `player - 403 forbidden`() =
        testApplication {
            application {
                installCapabilitySession()
                install(ContentNegotiation) { json(WIRE_JSON) }
                routing { undoActionRoute { _, _ -> UndoActionResult.Undone } }
            }
            val resp =
                client.post("/v1/actions/undo") {
                    cookie(SESSION_COOKIE_NAME, PLAYER_COOKIE)
                    contentType(ContentType.Application.Json)
                    setBody("{\"token\":\"undo-tok\"}")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Forbidden)
            assertThat(resp.bodyAsText()).contains("réservée aux mainteneurs")
        }

    @Test
    fun `anonymous - 403 forbidden`() =
        testApplication {
            application {
                installCapabilitySession()
                install(ContentNegotiation) { json(WIRE_JSON) }
                routing { undoActionRoute { _, _ -> UndoActionResult.Undone } }
            }
            val resp =
                client.post("/v1/actions/undo") {
                    contentType(ContentType.Application.Json)
                    setBody("{\"token\":\"undo-tok\"}")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Forbidden)
        }
}
