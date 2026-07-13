package com.bliss.grid.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import com.bliss.grid.api.auth.SessionMiddleware
import com.bliss.grid.application.auth.WhoAmI
import com.bliss.grid.application.correction.ListWordCluesUseCase
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordClue
import com.bliss.grid.infrastructure.persistence.InMemoryWordRepository
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
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Test
import java.util.UUID

class WordCluesRouteTest {
    private val userId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6d")
    private val maintainerCookie = "maintainer-session"

    private val words =
        InMemoryWordRepository(
            listOf(
                Word(
                    "ESSE",
                    listOf(
                        WordClue("Crochet en forme de S"),
                        WordClue("Lettre de l'alphabet", theme = "typographie"),
                    ),
                ),
            ),
        )

    private fun io.ktor.server.testing.ApplicationTestBuilder.mount(capabilities: Set<String>) {
        application {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
            install(SessionMiddleware) {
                verify = { cookie -> if (cookie == maintainerCookie) WhoAmI(userId, "Mainteneuse", capabilities) else null }
            }
            routing { wordClues(ListWordCluesUseCase(words)) }
        }
    }

    @Test
    fun `returns 403 when the session lacks admin signalements`() =
        testApplication {
            mount(capabilities = emptySet())
            val response = client.get("/v1/words/ESSE/clues") { cookie("__Secure-ws_session", maintainerCookie) }
            assertThat(response.status).isEqualTo(HttpStatusCode.Forbidden)
            assertThat(response.bodyAsText()).contains("capability-required")
        }

    @Test
    fun `returns 200 with every clue for a known multi-clue word`() =
        testApplication {
            mount(capabilities = setOf("admin:signalements"))
            val response = client.get("/v1/words/ESSE/clues") { cookie("__Secure-ws_session", maintainerCookie) }

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val clues = Json.parseToJsonElement(response.bodyAsText()).jsonObject["clues"]!!.jsonArray
            assertThat(clues).hasSize(2)
            assertThat(clues[0].jsonObject["text"]!!.jsonPrimitive.content).isEqualTo("Crochet en forme de S")
            // theme is required-and-nullable: present as null on a base-corpus clue (ADR-0003 §6).
            assertThat(clues[0].jsonObject["theme"]).isEqualTo(JsonNull)
            assertThat(clues[1].jsonObject["theme"]!!.jsonPrimitive.content).isEqualTo("typographie")
        }

    @Test
    fun `returns 404 for a word not in the corpus`() =
        testApplication {
            mount(capabilities = setOf("admin:signalements"))
            val response = client.get("/v1/words/INCONNU/clues") { cookie("__Secure-ws_session", maintainerCookie) }
            assertThat(response.status).isEqualTo(HttpStatusCode.NotFound)
            assertThat(response.bodyAsText()).contains("word-not-found")
        }
}
