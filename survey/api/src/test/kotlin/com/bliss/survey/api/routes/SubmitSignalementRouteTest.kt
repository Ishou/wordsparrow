package com.bliss.survey.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import com.bliss.survey.api.WIRE_JSON
import com.bliss.survey.api.auth.SESSION_COOKIE_NAME
import com.bliss.survey.application.usecases.SubmitSignalementCommand
import com.bliss.survey.application.usecases.SubmitSignalementResult
import com.bliss.survey.domain.model.ReportId
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

class SubmitSignalementRouteTest {
    private val reportUuid = UUID.fromString("11111111-1111-7111-8111-111111111111")

    private fun jsonBody(
        reason: String = "erreur_sens",
        surface: String = "solo",
    ): String = """{"wordText":"CHAT","clueText":"Animal qui miaule","reason":"$reason","surface":"$surface"}"""

    @Test
    fun `anonymous report - 201 created with reportId`() =
        testApplication {
            var capturedReporter: Boolean? = null
            application {
                installCapabilitySession()
                install(ContentNegotiation) { json(WIRE_JSON) }
                routing {
                    submitSignalementRoute { cmd: SubmitSignalementCommand ->
                        capturedReporter = cmd.reporterId != null
                        SubmitSignalementResult.Accepted(ReportId(reportUuid))
                    }
                }
            }
            val resp =
                client.post("/v1/signalements") {
                    contentType(ContentType.Application.Json)
                    setBody(jsonBody())
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Created)
            assertThat(resp.bodyAsText()).contains("\"reportId\":\"$reportUuid\"")
            assertThat(capturedReporter).isEqualTo(false)
        }

    @Test
    fun `authenticated report binds the reporter id`() =
        testApplication {
            var capturedReporter: Boolean? = null
            application {
                installCapabilitySession()
                install(ContentNegotiation) { json(WIRE_JSON) }
                routing {
                    submitSignalementRoute { cmd: SubmitSignalementCommand ->
                        capturedReporter = cmd.reporterId != null
                        SubmitSignalementResult.Accepted(ReportId(reportUuid))
                    }
                }
            }
            val resp =
                client.post("/v1/signalements") {
                    cookie(SESSION_COOKIE_NAME, PLAYER_COOKIE)
                    contentType(ContentType.Application.Json)
                    setBody(jsonBody())
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Created)
            assertThat(capturedReporter).isEqualTo(true)
        }

    @Test
    fun `harm reason report - use case sends the email once`() =
        testApplication {
            val sent = mutableListOf<SubmitSignalementCommand>()
            application {
                installCapabilitySession()
                install(ContentNegotiation) { json(WIRE_JSON) }
                routing {
                    submitSignalementRoute { cmd: SubmitSignalementCommand ->
                        sent += cmd
                        SubmitSignalementResult.Accepted(ReportId(reportUuid))
                    }
                }
            }
            val resp =
                client.post("/v1/signalements") {
                    contentType(ContentType.Application.Json)
                    setBody(jsonBody(reason = "mot_offensant"))
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Created)
            assertThat(sent.single().reason.name).isEqualTo("MOT_OFFENSANT")
        }

    @Test
    fun `duplicate report - 200 ok no body`() =
        testApplication {
            application {
                installCapabilitySession()
                install(ContentNegotiation) { json(WIRE_JSON) }
                routing {
                    submitSignalementRoute { _: SubmitSignalementCommand -> SubmitSignalementResult.DuplicateIgnored }
                }
            }
            val resp =
                client.post("/v1/signalements") {
                    cookie(SESSION_COOKIE_NAME, PLAYER_COOKIE)
                    contentType(ContentType.Application.Json)
                    setBody(jsonBody())
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.OK)
        }

    @Test
    fun `invalid reason - 400 problem details`() =
        testApplication {
            application {
                installCapabilitySession()
                install(ContentNegotiation) { json(WIRE_JSON) }
                routing {
                    submitSignalementRoute { _: SubmitSignalementCommand -> SubmitSignalementResult.Accepted(ReportId(reportUuid)) }
                }
            }
            val resp =
                client.post("/v1/signalements") {
                    contentType(ContentType.Application.Json)
                    setBody(jsonBody(reason = "not_a_reason"))
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(resp.bodyAsText()).contains("invalid reason")
        }

    @Test
    fun `invalid surface - 400 problem details`() =
        testApplication {
            application {
                installCapabilitySession()
                install(ContentNegotiation) { json(WIRE_JSON) }
                routing {
                    submitSignalementRoute { _: SubmitSignalementCommand -> SubmitSignalementResult.Accepted(ReportId(reportUuid)) }
                }
            }
            val resp =
                client.post("/v1/signalements") {
                    contentType(ContentType.Application.Json)
                    setBody(jsonBody(surface = "not_a_surface"))
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(resp.bodyAsText()).contains("invalid surface")
        }
}
