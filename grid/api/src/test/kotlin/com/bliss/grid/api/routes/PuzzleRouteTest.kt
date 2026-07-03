package com.bliss.grid.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import assertk.assertions.isGreaterThan
import assertk.assertions.isGreaterThanOrEqualTo
import assertk.assertions.isNotEqualTo
import assertk.assertions.isNull
import assertk.assertions.isTrue
import assertk.assertions.startsWith
import com.bliss.grid.api.dto.PuzzleResponse
import com.bliss.grid.api.module
import com.bliss.grid.application.auth.CookieVerifier
import com.bliss.grid.application.auth.WhoAmI
import com.bliss.grid.application.puzzle.GeneratePuzzleUseCase
import com.bliss.grid.application.puzzle.LoadOrGeneratePuzzleUseCase
import com.bliss.grid.application.puzzle.PUZZLE_HEIGHT
import com.bliss.grid.application.puzzle.PUZZLE_WIDTH
import com.bliss.grid.application.puzzle.RevealCellHintUseCase
import com.bliss.grid.application.puzzle.StoredPuzzle
import com.bliss.grid.application.puzzle.ValidatePuzzleUseCase
import com.bliss.grid.application.puzzle.ValidateWordUseCase
import com.bliss.grid.application.puzzle.defaultPuzzleConstraints
import com.bliss.grid.domain.generation.WordRepository
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
import io.ktor.client.request.cookie
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID

/** Wire-path tests for `GET /v1/puzzles/{puzzleId}` via Ktor [testApplication]. */
class PuzzleRouteTest {
    private val validId = "0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b"

    @Test
    fun `responds 200 with a puzzle whose body matches the OpenAPI shape`() =
        testApplication {
            application { module() }

            val response = client.get("/v1/puzzles/$validId")

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.headers["Content-Type"]!!).startsWith("application/json")

            val json = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(json["id"]!!.jsonPrimitive.content).isEqualTo(validId)
            assertThat(json["width"]!!.jsonPrimitive.content.toInt()).isEqualTo(PUZZLE_WIDTH)
            assertThat(json["height"]!!.jsonPrimitive.content.toInt()).isEqualTo(PUZZLE_HEIGHT)
            // ClueCells with two stacked clues emit two DefinitionCellDtos at
            // the same position, so cells.length is >= width * height.
            assertThat(json["cells"]!!.jsonArray.size).isGreaterThanOrEqualTo(PUZZLE_WIDTH * PUZZLE_HEIGHT)
        }

    @Test
    fun `every DefinitionCell clueId resolves in the clues array, which is non-empty`() =
        testApplication {
            application { module() }

            val json =
                Json
                    .parseToJsonElement(client.get("/v1/puzzles/$validId").bodyAsText())
                    .jsonObject
            val clues = json["clues"]!!.jsonArray
            val cells = json["cells"]!!.jsonArray
            val clueIds = clues.map { it.jsonObject["id"]!!.jsonPrimitive.content }.toSet()

            assertThat(clues.size).isGreaterThan(0)
            val referenced =
                cells
                    .map { it.jsonObject }
                    .filter { it["kind"]?.jsonPrimitive?.content == "definition" }
                    .map { it["clueId"]!!.jsonPrimitive.content }
            assertThat(referenced.size).isGreaterThan(0)
            referenced.forEach { id ->
                assertThat(clueIds.contains(id)).isTrue()
            }
        }

    @Test
    fun `cells emit non-decreasing row-major positions, all within bounds`() =
        testApplication {
            application { module() }

            val json =
                Json
                    .parseToJsonElement(client.get("/v1/puzzles/$validId").bodyAsText())
                    .jsonObject
            val cells = json["cells"]!!.jsonArray
            val width = json["width"]!!.jsonPrimitive.content.toInt()
            val height = json["height"]!!.jsonPrimitive.content.toInt()

            var lastIndex = -1
            cells.forEach { cell ->
                val pos = (cell as JsonObject)["position"]!!.jsonObject
                val row = pos["row"]!!.jsonPrimitive.content.toInt()
                val col = pos["column"]!!.jsonPrimitive.content.toInt()
                assertThat(row in 0 until height).isTrue()
                assertThat(col in 0 until width).isTrue()
                val flat = row * width + col
                assertThat(flat).isGreaterThanOrEqualTo(lastIndex)
                lastIndex = flat
            }
        }

    @Test
    fun `responds 400 with problem json for non-uuid puzzle id`() =
        testApplication {
            application { module() }

            val response = client.get("/v1/puzzles/not-a-uuid")

            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(response.headers["Content-Type"]!!).startsWith("application/problem+json")
            assertThat(response.bodyAsText()).contains("\"status\":400")
        }

    @Test
    fun `distinct puzzleIds produce different cell layouts - generator randomness`() =
        testApplication {
            application { module() }

            val secondId = "0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c"
            val first = client.get("/v1/puzzles/$validId").bodyAsText()
            val second = client.get("/v1/puzzles/$secondId").bodyAsText()

            val firstCells =
                Json
                    .parseToJsonElement(first)
                    .jsonObject["cells"]!!
                    .jsonArray
                    .toString()
            val secondCells =
                Json
                    .parseToJsonElement(second)
                    .jsonObject["cells"]!!
                    .jsonArray
                    .toString()

            assertThat(firstCells).isNotEqualTo(secondCells)
        }

    @Test
    fun `consecutive GETs on the same puzzleId return the same canonical layout`() =
        testApplication {
            application { module() }

            val first = Json.parseToJsonElement(client.get("/v1/puzzles/$validId").bodyAsText()).jsonObject
            val second = Json.parseToJsonElement(client.get("/v1/puzzles/$validId").bodyAsText()).jsonObject

            // Stable canonical layout: same dimensions, same letter-cell
            // positions. The puzzle store wired up by Module is doing its
            // job — the validate endpoint depends on this stability.
            // (Wire-level clueIds re-roll across calls because the mapper
            // uses a time-based UUID v7 generator; clueId stability is a
            // separate concern not promised by the OpenAPI today.)
            assertThat(first["width"]!!.jsonPrimitive.content).isEqualTo(second["width"]!!.jsonPrimitive.content)
            assertThat(first["height"]!!.jsonPrimitive.content).isEqualTo(second["height"]!!.jsonPrimitive.content)
            val firstLetters = letterPositions(first)
            val secondLetters = letterPositions(second)
            assertThat(firstLetters).isEqualTo(secondLetters)
        }

    private fun letterPositions(puzzleJson: JsonObject): List<Pair<Int, Int>> =
        puzzleJson["cells"]!!
            .jsonArray
            .map { it.jsonObject }
            .filter { it["kind"]?.jsonPrimitive?.content == "letter" }
            .map {
                val pos = it["position"]!!.jsonObject
                pos["row"]!!.jsonPrimitive.content.toInt() to pos["column"]!!.jsonPrimitive.content.toInt()
            }

    @Test
    fun `responds 200 with hintsAllowed in the body`() =
        testApplication {
            application { module() }

            val body = client.get("/v1/puzzles/$validId").bodyAsText()
            val json = Json.parseToJsonElement(body).jsonObject

            assertThat(json["hintsAllowed"]!!.jsonPrimitive.content.toInt()).isEqualTo(3)
        }

    @Test
    fun `responds 200 with difficulty and gridNumber absent when mapper receives null values`() =
        testApplication {
            application { module() }

            val body = client.get("/v1/puzzles/$validId").bodyAsText()
            val json = Json.parseToJsonElement(body).jsonObject

            // The Module json config sets `explicitNulls = false`, so null-valued
            // optional fields are omitted from the wire payload (not emitted as
            // `"foo": null`). Frontend types generated from the spec accept
            // `undefined | null` for nullable fields, so absence is contract-OK.
            assertThat(json.containsKey("difficulty")).isEqualTo(false)
            assertThat(json.containsKey("gridNumber")).isEqualTo(false)
        }

    private val dailyDate: LocalDate = LocalDate.parse("2026-05-09")

    @Test
    fun `daily endpoint responds 200 with populated difficulty and gridNumber`() =
        testApplication {
            application { dailyRouteWith { it.insertDaily(UUID.randomUUID(), dailyDate, storedDailyPuzzle()) } }

            val response = client.get("/v1/puzzles/daily?date=2026-05-09")

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val json = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(json["difficulty"]!!.jsonPrimitive.content).isEqualTo("facile")
            // 2026-05-09 is day 129 since 2026-01-01 (anchor day 1).
            assertThat(json["gridNumber"]!!.jsonPrimitive.content.toInt()).isEqualTo(129)
        }

    // Pinned to literals (not PUZZLE_WIDTH/HEIGHT) so a future drift in the
    // shared default would fail this case rather than silently follow.
    @Test
    fun `daily endpoint returns a 28x20 landscape grid`() =
        testApplication {
            application {
                dailyRouteWith { it.insertDaily(UUID.randomUUID(), dailyDate, storedDailyPuzzle(width = 28, height = 20)) }
            }

            val response = client.get("/v1/puzzles/daily?date=2026-05-09")

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val json = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(json["width"]!!.jsonPrimitive.content.toInt()).isEqualTo(28)
            assertThat(json["height"]!!.jsonPrimitive.content.toInt()).isEqualTo(20)
        }

    @Test
    fun `daily endpoint returns the same puzzle id for the same date`() =
        testApplication {
            application { dailyRouteWith { it.insertDaily(UUID.randomUUID(), dailyDate, storedDailyPuzzle()) } }

            val first = Json.parseToJsonElement(client.get("/v1/puzzles/daily?date=2026-05-09").bodyAsText()).jsonObject
            val second = Json.parseToJsonElement(client.get("/v1/puzzles/daily?date=2026-05-09").bodyAsText()).jsonObject

            assertThat(first["id"]!!.jsonPrimitive.content).isEqualTo(second["id"]!!.jsonPrimitive.content)
        }

    @Test
    fun `daily endpoint resolves a regenerated date to the most recently created row`() =
        testApplication {
            application {
                dailyRouteWith { repo ->
                    repo.insertDaily(UUID.randomUUID(), dailyDate, storedDailyPuzzle(width = 7, height = 7))
                    repo.insertDaily(UUID.randomUUID(), dailyDate, storedDailyPuzzle(width = 9, height = 9))
                }
            }

            val response = client.get("/v1/puzzles/daily?date=2026-05-09")

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val json = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            // The second insert wins; the resolver points at the newest row, not the first.
            assertThat(json["width"]!!.jsonPrimitive.content.toInt()).isEqualTo(9)
        }

    @Test
    fun `daily endpoint rejects malformed date with RFC 7807 problem`() =
        testApplication {
            application { module() }

            val response = client.get("/v1/puzzles/daily?date=not-a-date")

            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            val json = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(json["type"]!!.jsonPrimitive.content)
                .isEqualTo("https://bliss.example/errors/invalid-puzzle-date")
        }

    @Test
    fun `daily endpoint omits gridNumber for a pre-launch date`() =
        testApplication {
            val preLaunch = LocalDate.parse("2025-12-31")
            application { dailyRouteWith { it.insertDaily(UUID.randomUUID(), preLaunch, storedDailyPuzzle()) } }

            val response = client.get("/v1/puzzles/daily?date=2025-12-31")

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val json = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(json.containsKey("gridNumber")).isEqualTo(false)
        }

    private fun storedDailyPuzzle(
        width: Int = 15,
        height: Int = 12,
    ): StoredPuzzle {
        val word = Word(text = "ABCDE", definition = "test")
        val placement =
            WordPlacement(
                word = word,
                cluePosition = Position(Row(0), Column(0)),
                direction = Direction.DOWN_RIGHT,
                chosenClue = word.clues.first(),
            )
        return StoredPuzzle(
            grid = Grid.fromPlacements(width = width, height = height, placements = listOf(placement)),
            title = "Grille du jour",
            language = "fr",
            hintsAllowed = 3,
            createdAt = Instant.parse("2026-05-09T00:00:00Z"),
        )
    }

    private fun Application.dailyRouteWith(
        clock: Clock = Clock.systemUTC(),
        cookieVerifier: CookieVerifier = FakeCookieVerifier(),
        seed: (InMemoryPuzzleRepository) -> Unit,
    ) {
        install(ContentNegotiation) {
            json(
                Json {
                    ignoreUnknownKeys = true
                    explicitNulls = false
                },
            )
        }
        val repo = InMemoryPuzzleRepository()
        seed(repo)
        val gen = GeneratePuzzleUseCase(EmptyWordRepository, defaultPuzzleConstraints())
        val hintRepo = InMemoryHintUsageRepository()
        routing {
            puzzles(
                loadOrGenerate = LoadOrGeneratePuzzleUseCase(repo, gen),
                revealCellHint = RevealCellHintUseCase(repo, hintRepo),
                validatePuzzle = ValidatePuzzleUseCase(repo),
                validateWord = ValidateWordUseCase(repo),
                puzzleRepository = repo,
                hintUsageRepository = hintRepo,
                hintWriteCoordinator = InMemoryHintWriteCoordinator(),
                cookieVerifier = cookieVerifier,
                clock = clock,
            )
        }
    }

    private val cacheClock: Clock =
        Clock.fixed(Instant.parse("2026-05-09T10:00:00Z"), ZoneOffset.UTC)

    @Test
    fun `anonymous daily emits public cache-control with s-maxage until utc midnight and a puzzle-id etag`() =
        testApplication {
            val id = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6d")
            application { dailyRouteWith(clock = cacheClock) { it.insertDaily(id, dailyDate, storedDailyPuzzle()) } }

            val response = client.get("/v1/puzzles/daily?date=2026-05-09")

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            // 2026-05-09T10:00:00Z -> next UTC midnight is 14h = 50400s away.
            assertThat(response.headers["Cache-Control"]!!).isEqualTo("public, no-cache, s-maxage=50400")
            assertThat(response.headers["ETag"]!!).isEqualTo("\"$id\"")
        }

    @Test
    fun `cookied daily emits private no-store and no etag`() =
        testApplication {
            val verifier = FakeCookieVerifier(cached = WhoAmI(userId = UUID.randomUUID(), displayName = "joueur"))
            application {
                dailyRouteWith(clock = cacheClock, cookieVerifier = verifier) {
                    it.insertDaily(UUID.randomUUID(), dailyDate, storedDailyPuzzle())
                }
            }

            val response =
                client.get("/v1/puzzles/daily?date=2026-05-09") {
                    cookie("__Secure-ws_session", "session-token")
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.headers["Cache-Control"]!!).isEqualTo("private, no-store")
            assertThat(response.headers["ETag"]).isNull()
        }

    @Test
    fun `anonymous daily answers 304 with cache headers and empty body on matching If-None-Match`() =
        testApplication {
            val id = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6e")
            application { dailyRouteWith(clock = cacheClock) { it.insertDaily(id, dailyDate, storedDailyPuzzle()) } }

            val response =
                client.get("/v1/puzzles/daily?date=2026-05-09") {
                    header(HttpHeaders.IfNoneMatch, "\"$id\"")
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.NotModified)
            assertThat(response.bodyAsText()).isEqualTo("")
            assertThat(response.headers["Cache-Control"]!!).isEqualTo("public, no-cache, s-maxage=50400")
            assertThat(response.headers["ETag"]!!).isEqualTo("\"$id\"")
        }

    @Test
    fun `cookied daily never answers 304 even when If-None-Match carries the current puzzle id`() =
        testApplication {
            val id = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6f")
            val verifier = FakeCookieVerifier(cached = WhoAmI(userId = UUID.randomUUID(), displayName = "joueur"))
            application {
                dailyRouteWith(clock = cacheClock, cookieVerifier = verifier) {
                    it.insertDaily(id, dailyDate, storedDailyPuzzle())
                }
            }

            val response =
                client.get("/v1/puzzles/daily?date=2026-05-09") {
                    cookie("__Secure-ws_session", "session-token")
                    header(HttpHeaders.IfNoneMatch, "\"$id\"")
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.headers["Cache-Control"]!!).isEqualTo("private, no-store")
        }

    @Test
    fun `regenerated daily flips the etag so a stale If-None-Match gets 200 with the new body`() =
        testApplication {
            val oldId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a01")
            val newId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a02")
            application {
                dailyRouteWith(clock = cacheClock) { repo ->
                    repo.insertDaily(oldId, dailyDate, storedDailyPuzzle(width = 7, height = 7))
                    repo.insertDaily(newId, dailyDate, storedDailyPuzzle(width = 9, height = 9))
                }
            }

            val response =
                client.get("/v1/puzzles/daily?date=2026-05-09") {
                    header(HttpHeaders.IfNoneMatch, "\"$oldId\"")
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.headers["ETag"]!!).isEqualTo("\"$newId\"")
            val json = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(json["width"]!!.jsonPrimitive.content.toInt()).isEqualTo(9)
        }

    @Test
    fun `daily 404 carries no cache headers`() =
        testApplication {
            application { dailyRouteWith(clock = cacheClock) { } }

            val response = client.get("/v1/puzzles/daily?date=2026-05-09")

            assertThat(response.status).isEqualTo(HttpStatusCode.NotFound)
            assertThat(response.headers["Cache-Control"]).isNull()
            assertThat(response.headers["ETag"]).isNull()
        }

    @Test
    fun `daily endpoint responds 404 with RFC 7807 problem when no row is persisted`() =
        testApplication {
            application {
                val puzzleRepo = InMemoryPuzzleRepository()
                val hintUsageRepo = InMemoryHintUsageRepository()
                val gen = GeneratePuzzleUseCase(EmptyWordRepository, defaultPuzzleConstraints())
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
                    )
                }
            }

            val response = client.get("/v1/puzzles/daily?date=2026-05-09")

            assertThat(response.status).isEqualTo(HttpStatusCode.NotFound)
            assertThat(response.headers["Content-Type"]!!).startsWith("application/problem+json")
            val json = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(json["type"]!!.jsonPrimitive.content)
                .isEqualTo("https://bliss.example/errors/no-daily-puzzle")
            assertThat(json["status"]!!.jsonPrimitive.content.toInt()).isEqualTo(404)
        }

    private object EmptyWordRepository : WordRepository {
        override fun findByLength(length: Int): List<Word> = emptyList()

        override fun findByLengthAndPattern(
            length: Int,
            pattern: Map<Int, Char>,
        ): List<Word> = emptyList()

        override fun containsLemma(text: String): Boolean = false
    }

    @Test
    fun `LetterCells in the response carry no canonical letter`() =
        testApplication {
            application { module() }

            val body = client.get("/v1/puzzles/$validId").bodyAsText()
            val cells = Json.parseToJsonElement(body).jsonObject["cells"]!!.jsonArray

            cells
                .map { it.jsonObject }
                .filter { it["kind"]?.jsonPrimitive?.content == "letter" }
                .forEach { letterCell ->
                    assertThat(letterCell.containsKey("letter")).isEqualTo(false)
                }
        }

    @Test
    fun `response body deserializes as PuzzleResponse - schema drift guard`() =
        testApplication {
            application { module() }
            val body = client.get("/v1/puzzles/$validId").bodyAsText()
            // Throws SerializationException if wire shape diverges from the DTO (ADR-0003 §9).
            val puzzle = Json { ignoreUnknownKeys = true }.decodeFromString<PuzzleResponse>(body)
            assertThat(puzzle.id).isEqualTo(validId)
        }

    @Test
    fun `accepts width and height query params and reflects them in the response`() =
        testApplication {
            application { module() }

            val response = client.get("/v1/puzzles/$validId?width=7&height=7")

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val json = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(json["width"]!!.jsonPrimitive.content.toInt()).isEqualTo(7)
            assertThat(json["height"]!!.jsonPrimitive.content.toInt()).isEqualTo(7)
        }

    @Test
    fun `responds 400 with invalid-puzzle-dimensions when width is below the minimum`() =
        testApplication {
            application { module() }

            val response = client.get("/v1/puzzles/$validId?width=4") // one below the spec minimum of 5

            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(response.headers["Content-Type"]!!).startsWith("application/problem+json")
            val body = response.bodyAsText()
            assertThat(body).contains("invalid-puzzle-dimensions")
            assertThat(body).contains("\"status\":400")
        }

    @Test
    fun `responds 400 with invalid-puzzle-dimensions when height is above the maximum`() =
        testApplication {
            application { module() }

            val response = client.get("/v1/puzzles/$validId?height=29") // one above the spec maximum of 28

            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(response.bodyAsText()).contains("invalid-puzzle-dimensions")
        }

    @Test
    fun `responds 400 with invalid-puzzle-dimensions when width is not an integer`() =
        testApplication {
            application { module() }

            val response = client.get("/v1/puzzles/$validId?width=abc")

            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(response.bodyAsText()).contains("invalid-puzzle-dimensions")
        }

    @Test
    fun `responds 422 with problem json when generator cannot satisfy constraints`() =
        testApplication {
            application {
                val emptyRepo =
                    object : WordRepository {
                        override fun findByLength(length: Int): List<Word> = emptyList()

                        override fun findByLengthAndPattern(
                            length: Int,
                            pattern: Map<Int, Char>,
                        ): List<Word> = emptyList()

                        override fun containsLemma(text: String): Boolean = false
                    }
                val gen = GeneratePuzzleUseCase(emptyRepo, defaultPuzzleConstraints())
                val puzzleRepo = InMemoryPuzzleRepository()
                val hintUsageRepo = InMemoryHintUsageRepository()
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
                    )
                }
            }

            val response = client.get("/v1/puzzles/$validId")

            assertThat(response.status).isEqualTo(HttpStatusCode.UnprocessableEntity)
            assertThat(response.headers["Content-Type"]!!).startsWith("application/problem+json")
            assertThat(response.bodyAsText()).contains("puzzle-generation-failed")
        }
}
