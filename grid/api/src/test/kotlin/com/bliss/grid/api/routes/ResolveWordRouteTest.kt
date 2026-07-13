package com.bliss.grid.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import com.bliss.grid.api.TestCorpus
import com.bliss.grid.application.puzzle.GeneratePuzzleUseCase
import com.bliss.grid.application.puzzle.LoadOrGeneratePuzzleUseCase
import com.bliss.grid.application.puzzle.ResolveWordUseCase
import com.bliss.grid.application.puzzle.RevealCellHintUseCase
import com.bliss.grid.application.puzzle.StoredPuzzle
import com.bliss.grid.application.puzzle.ValidatePuzzleUseCase
import com.bliss.grid.application.puzzle.ValidateWordUseCase
import com.bliss.grid.application.puzzle.VerifyGridUseCase
import com.bliss.grid.application.puzzle.defaultPuzzleConstraints
import com.bliss.grid.domain.model.Column
import com.bliss.grid.domain.model.Direction
import com.bliss.grid.domain.model.Grid
import com.bliss.grid.domain.model.Position
import com.bliss.grid.domain.model.Row
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordPlacement
import com.bliss.grid.infrastructure.persistence.InMemoryHintUsageRepository
import com.bliss.grid.infrastructure.persistence.InMemoryHintWriteCoordinator
import com.bliss.grid.infrastructure.persistence.InMemoryPuzzleRepository
import com.bliss.grid.infrastructure.persistence.InMemoryVerifyUsageRepository
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
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

/** Wire-path tests for `POST /v1/puzzles/{puzzleId}/resolve-word`; internal service-token gate + answer-word lookup (ADR-0111). */
class ResolveWordRouteTest {
    private val puzzleId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b")
    private val serviceToken = "s3cr3t-service-token-value"

    // PAIN placed at (0,0) Direction.RIGHT with clue "du pain quotidien".
    private val grid =
        Grid.fromPlacements(
            width = 5,
            height = 3,
            placements =
                listOf(
                    WordPlacement(
                        Word(text = "PAIN", definition = "du pain quotidien"),
                        Position(Row(0), Column(0)),
                        Direction.RIGHT,
                    ),
                ),
        )

    private fun ApplicationTestBuilder.mount(token: String?) {
        application {
            install(ContentNegotiation) {
                json(
                    Json {
                        ignoreUnknownKeys = true
                        explicitNulls = false
                    },
                )
            }
            val puzzleRepo = InMemoryPuzzleRepository()
            puzzleRepo.getOrCompute(puzzleId) {
                StoredPuzzle(
                    grid = grid,
                    title = "T",
                    language = "fr",
                    hintsAllowed = 3,
                    createdAt = Instant.parse("2026-04-24T15:30:00Z"),
                )
            }
            val hintUsageRepo = InMemoryHintUsageRepository()
            val gen = GeneratePuzzleUseCase(TestCorpus.load(), defaultPuzzleConstraints())
            routing {
                puzzles(
                    loadOrGenerate = LoadOrGeneratePuzzleUseCase(puzzleRepo, gen),
                    revealCellHint = RevealCellHintUseCase(puzzleRepo, hintUsageRepo),
                    validatePuzzle = ValidatePuzzleUseCase(puzzleRepo),
                    validateWord = ValidateWordUseCase(puzzleRepo),
                    resolveWord = ResolveWordUseCase(puzzleRepo),
                    verifyGrid = VerifyGridUseCase(puzzleRepo, InMemoryVerifyUsageRepository()),
                    puzzleRepository = puzzleRepo,
                    hintUsageRepository = hintUsageRepo,
                    hintWriteCoordinator = InMemoryHintWriteCoordinator(),
                    cookieVerifier = FakeCookieVerifier(),
                    wordValidateServiceToken = token,
                )
            }
        }
    }

    private fun body(clueText: String) = """{"clueText":${Json.encodeToString(clueText)}}"""

    @Test
    fun `responds 401 service-auth-required when X-Service-Token header is missing`() =
        testApplication {
            mount(token = serviceToken)

            val response =
                client.post("/v1/puzzles/$puzzleId/resolve-word") {
                    headers { append(HttpHeaders.ContentType, ContentType.Application.Json.toString()) }
                    setBody(body("du pain quotidien"))
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.Unauthorized)
            assertThat(response.bodyAsText()).contains("service-auth-required")
        }

    @Test
    fun `responds 401 service-auth-required when X-Service-Token does not match`() =
        testApplication {
            mount(token = serviceToken)

            val response =
                client.post("/v1/puzzles/$puzzleId/resolve-word") {
                    headers {
                        append(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        append("X-Service-Token", "wrong-token")
                    }
                    setBody(body("du pain quotidien"))
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.Unauthorized)
            assertThat(response.bodyAsText()).contains("service-auth-required")
        }

    @Test
    fun `responds 200 with the placed word for a known clue`() =
        testApplication {
            mount(token = serviceToken)

            val response =
                client.post("/v1/puzzles/$puzzleId/resolve-word") {
                    headers {
                        append(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        append("X-Service-Token", serviceToken)
                    }
                    setBody(body("du pain quotidien"))
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val json = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(json["word"]!!.jsonPrimitive.content).isEqualTo("PAIN")
        }

    @Test
    fun `responds 404 clue-not-on-puzzle for an unknown clue`() =
        testApplication {
            mount(token = serviceToken)

            val response =
                client.post("/v1/puzzles/$puzzleId/resolve-word") {
                    headers {
                        append(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        append("X-Service-Token", serviceToken)
                    }
                    setBody(body("indice absent"))
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.NotFound)
            assertThat(response.bodyAsText()).contains("clue-not-on-puzzle")
        }

    @Test
    fun `responds 404 clue-not-on-puzzle for an unknown puzzleId`() =
        testApplication {
            mount(token = serviceToken)

            val unknownId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-000000000000")
            val response =
                client.post("/v1/puzzles/$unknownId/resolve-word") {
                    headers {
                        append(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        append("X-Service-Token", serviceToken)
                    }
                    setBody(body("du pain quotidien"))
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.NotFound)
            assertThat(response.bodyAsText()).contains("clue-not-on-puzzle")
        }
}
