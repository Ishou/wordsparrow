package com.bliss.grid.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import com.bliss.grid.api.TestCorpus
import com.bliss.grid.application.auth.WhoAmI
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
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

/** Wire-path tests for `POST /v1/puzzles/{puzzleId}/verify` (ADR-0099). */
class PuzzleRouteVerifyTest {
    private val puzzleId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b")
    private val userId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c")
    private val cookieValue = "session-cookie-value"

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

    private fun ApplicationTestBuilder.mount(verifier: FakeCookieVerifier) {
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
            // Shared so a verify POST's cooldown is visible to the puzzle GET, mirroring the single per-user row in prod.
            val verifyUsageRepo = InMemoryVerifyUsageRepository()
            val gen = GeneratePuzzleUseCase(TestCorpus.load(), defaultPuzzleConstraints())
            routing {
                puzzles(
                    loadOrGenerate = LoadOrGeneratePuzzleUseCase(puzzleRepo, gen),
                    revealCellHint = RevealCellHintUseCase(puzzleRepo, hintUsageRepo),
                    validatePuzzle = ValidatePuzzleUseCase(puzzleRepo),
                    validateWord = ValidateWordUseCase(puzzleRepo),
                    resolveWord = ResolveWordUseCase(puzzleRepo),
                    verifyGrid = VerifyGridUseCase(puzzleRepo, verifyUsageRepo),
                    puzzleRepository = puzzleRepo,
                    hintUsageRepository = hintUsageRepo,
                    verifyUsageRepository = verifyUsageRepo,
                    hintWriteCoordinator = InMemoryHintWriteCoordinator(),
                    cookieVerifier = verifier,
                )
            }
        }
    }

    private val correctBody =
        """{"cells":[{"row":0,"column":1,"letter":"P"},{"row":0,"column":2,"letter":"A"},""" +
            """{"row":0,"column":3,"letter":"X"},{"row":0,"column":4,"letter":"N"}]}"""

    private suspend fun verify(
        client: io.ktor.client.HttpClient,
        body: String,
        withCookie: Boolean = true,
        targetPuzzleId: UUID = puzzleId,
    ) = client.post("/v1/puzzles/$targetPuzzleId/verify") {
        if (withCookie) cookie(SESSION_COOKIE_NAME, cookieValue)
        headers { append(HttpHeaders.ContentType, ContentType.Application.Json.toString()) }
        setBody(body)
    }

    @Test
    fun `responds 200 with per-cell verdicts and a fresh cooldown`() =
        testApplication {
            mount(FakeCookieVerifier(cached = WhoAmI(userId, "Joueuse", emptySet())))

            val response = verify(client, correctBody)

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val cells = body["cells"]!!.jsonArray
            assertThat(cells.map { it.jsonObject["correct"]!!.jsonPrimitive.content })
                .isEqualTo(listOf("true", "true", "false", "true"))
            assertThat(body["secondsUntilNextVerify"]!!.jsonPrimitive.content).isEqualTo("1800")
        }

    @Test
    fun `responds 429 verify-cooldown-active on the second call within the cooldown window`() =
        testApplication {
            mount(FakeCookieVerifier(cached = WhoAmI(userId, "Joueuse", emptySet())))
            verify(client, correctBody)

            val response = verify(client, correctBody)

            assertThat(response.status).isEqualTo(HttpStatusCode.TooManyRequests)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(body["type"]!!.jsonPrimitive.content).contains("verify-cooldown-active")
            assertThat(body["secondsUntilNextVerify"]!!.jsonPrimitive.content.toInt() > 0).isEqualTo(true)
        }

    @Test
    fun `responds 401 auth-required when the cookie is missing`() =
        testApplication {
            mount(FakeCookieVerifier(cached = WhoAmI(userId, "Joueuse", emptySet())))

            val response = verify(client, correctBody, withCookie = false)

            assertThat(response.status).isEqualTo(HttpStatusCode.Unauthorized)
            assertThat(response.bodyAsText()).contains("auth-required")
        }

    @Test
    fun `responds 401 auth-required when verifyFresh returns null even though verify cached a positive`() =
        testApplication {
            mount(FakeCookieVerifier(cached = WhoAmI(userId, "Joueuse", emptySet()), fresh = null))

            val response = verify(client, correctBody)

            assertThat(response.status).isEqualTo(HttpStatusCode.Unauthorized)
            assertThat(response.bodyAsText()).contains("auth-required")
        }

    @Test
    fun `responds 400 invalid-coord when a cell is out of grid bounds`() =
        testApplication {
            mount(FakeCookieVerifier(cached = WhoAmI(userId, "Joueuse", emptySet())))

            val response = verify(client, """{"cells":[{"row":999,"column":0,"letter":"P"}]}""")

            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(response.bodyAsText()).contains("invalid-coord")
        }

    @Test
    fun `responds 400 on malformed JSON without reaching the use case`() =
        testApplication {
            mount(FakeCookieVerifier(cached = WhoAmI(userId, "Joueuse", emptySet())))

            // ContentNegotiation's own decode-failure handling responds 400 before the route's SerializationException catch runs; same pre-existing shape as /hints.
            val response = verify(client, """{"cells": not-json}""")

            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
        }

    @Test
    fun `responds 404 puzzle-not-found when puzzleId is unknown`() =
        testApplication {
            mount(FakeCookieVerifier(cached = WhoAmI(userId, "Joueuse", emptySet())))
            val unknownId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a99")

            val response = verify(client, correctBody, targetPuzzleId = unknownId)

            assertThat(response.status).isEqualTo(HttpStatusCode.NotFound)
            assertThat(response.bodyAsText()).contains("puzzle-not-found")
        }

    @Test
    fun `GET puzzle surfaces the active verify cooldown for the authenticated caller`() =
        testApplication {
            mount(FakeCookieVerifier(cached = WhoAmI(userId, "Joueuse", emptySet())))
            verify(client, correctBody)

            val response =
                client.get("/v1/puzzles/$puzzleId") {
                    cookie(SESSION_COOKIE_NAME, cookieValue)
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(body["secondsUntilNextVerify"]!!.jsonPrimitive.content.toInt() > 0).isEqualTo(true)
        }

    @Test
    fun `GET puzzle reports a null verify cooldown for an anonymous caller`() =
        testApplication {
            mount(FakeCookieVerifier(cached = WhoAmI(userId, "Joueuse", emptySet())))

            val response = client.get("/v1/puzzles/$puzzleId")

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(body["secondsUntilNextVerify"]).isEqualTo(JsonNull)
        }
}

private const val SESSION_COOKIE_NAME: String = "__Secure-ws_session"
