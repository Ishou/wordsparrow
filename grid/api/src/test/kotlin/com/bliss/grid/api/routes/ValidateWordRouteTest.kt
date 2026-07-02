package com.bliss.grid.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import com.bliss.grid.application.puzzle.GeneratePuzzleUseCase
import com.bliss.grid.application.puzzle.LoadOrGeneratePuzzleUseCase
import com.bliss.grid.application.puzzle.RevealCellHintUseCase
import com.bliss.grid.application.puzzle.StoredPuzzle
import com.bliss.grid.application.puzzle.ValidatePuzzleUseCase
import com.bliss.grid.application.puzzle.ValidateWordUseCase
import com.bliss.grid.application.puzzle.defaultPuzzleConstraints
import com.bliss.grid.domain.model.Column
import com.bliss.grid.domain.model.Direction
import com.bliss.grid.domain.model.Grid
import com.bliss.grid.domain.model.Position
import com.bliss.grid.domain.model.Row
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordPlacement
import com.bliss.grid.infrastructure.persistence.CsvWordRepository
import com.bliss.grid.infrastructure.persistence.InMemoryHintUsageRepository
import com.bliss.grid.infrastructure.persistence.InMemoryHintWriteCoordinator
import com.bliss.grid.infrastructure.persistence.InMemoryPuzzleRepository
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
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

/** Wire-path tests for `POST /v1/puzzles/{puzzleId}/validate-word`; the internal service-token gate (ADR-0084). */
class ValidateWordRouteTest {
    private val puzzleId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b")
    private val serviceToken = "s3cr3t-service-token-value"

    // PAIN at (0,0) Direction.RIGHT: letters P,A,I,N at (0,1)..(0,4).
    private val grid =
        Grid.fromPlacements(
            width = 5,
            height = 3,
            placements =
                listOf(
                    WordPlacement(
                        Word(text = "PAIN", definition = "bread"),
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
            val gen = GeneratePuzzleUseCase(CsvWordRepository.frenchFromClasspath(), defaultPuzzleConstraints())
            routing {
                puzzles(
                    loadOrGenerate = LoadOrGeneratePuzzleUseCase(puzzleRepo, gen),
                    revealCellHint = RevealCellHintUseCase(puzzleRepo, hintUsageRepo),
                    validatePuzzle = ValidatePuzzleUseCase(puzzleRepo),
                    validateWord = ValidateWordUseCase(puzzleRepo),
                    puzzleRepository = puzzleRepo,
                    hintUsageRepository = hintUsageRepo,
                    hintWriteCoordinator = InMemoryHintWriteCoordinator(),
                    cookieVerifier = FakeCookieVerifier(),
                    wordValidateServiceToken = token,
                )
            }
        }
    }

    private val correctWordBody =
        """{"cells":[{"row":0,"column":1,"letter":"P"},{"row":0,"column":2,"letter":"A"},""" +
            """{"row":0,"column":3,"letter":"I"},{"row":0,"column":4,"letter":"N"}]}"""

    @Test
    fun `responds 401 service-auth-required when X-Service-Token header is missing`() =
        testApplication {
            mount(token = serviceToken)

            val response =
                client.post("/v1/puzzles/$puzzleId/validate-word") {
                    headers { append(HttpHeaders.ContentType, ContentType.Application.Json.toString()) }
                    setBody(correctWordBody)
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.Unauthorized)
            assertThat(response.bodyAsText()).contains("service-auth-required")
        }

    @Test
    fun `responds 401 service-auth-required when X-Service-Token does not match`() =
        testApplication {
            mount(token = serviceToken)

            val response =
                client.post("/v1/puzzles/$puzzleId/validate-word") {
                    headers {
                        append(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        append("X-Service-Token", "wrong-token")
                    }
                    setBody(correctWordBody)
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.Unauthorized)
            assertThat(response.bodyAsText()).contains("service-auth-required")
        }

    @Test
    fun `responds 401 service-auth-required when the server token env is unset`() =
        testApplication {
            mount(token = null)

            val response =
                client.post("/v1/puzzles/$puzzleId/validate-word") {
                    headers {
                        append(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        append("X-Service-Token", serviceToken)
                    }
                    setBody(correctWordBody)
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.Unauthorized)
            assertThat(response.bodyAsText()).contains("service-auth-required")
        }

    @Test
    fun `responds 200 correct=true with a valid token and a correct word`() =
        testApplication {
            mount(token = serviceToken)

            val response =
                client.post("/v1/puzzles/$puzzleId/validate-word") {
                    headers {
                        append(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        append("X-Service-Token", serviceToken)
                    }
                    setBody(correctWordBody)
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(body["correct"]!!.jsonPrimitive.content).isEqualTo("true")
        }

    @Test
    fun `responds 200 correct=false with a valid token and a wrong word - no positional data`() =
        testApplication {
            mount(token = serviceToken)

            val wrongBody =
                """{"cells":[{"row":0,"column":1,"letter":"P"},{"row":0,"column":2,"letter":"A"},""" +
                    """{"row":0,"column":3,"letter":"X"},{"row":0,"column":4,"letter":"N"}]}"""

            val response =
                client.post("/v1/puzzles/$puzzleId/validate-word") {
                    headers {
                        append(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        append("X-Service-Token", serviceToken)
                    }
                    setBody(wrongBody)
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(body["correct"]!!.jsonPrimitive.content).isEqualTo("false")
        }
}
