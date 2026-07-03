package com.bliss.grid.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.containsExactly
import assertk.assertions.hasSize
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isNotEqualTo
import assertk.assertions.isNull
import assertk.assertions.isTrue
import assertk.assertions.matches
import assertk.assertions.startsWith
import com.bliss.grid.api.dto.ListDailyPuzzlesResponseDto
import com.bliss.grid.application.puzzle.DailyPuzzleSelector
import com.bliss.grid.application.puzzle.GeneratePuzzleUseCase
import com.bliss.grid.application.puzzle.ListDailyPuzzlesUseCase
import com.bliss.grid.application.puzzle.LoadOrGeneratePuzzleUseCase
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
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID

class PuzzleRouteListDailiesTest {
    private val today = LocalDate.parse("2026-05-16")
    private val fixedClock: Clock = Clock.fixed(today.atStartOfDay(ZoneOffset.UTC).toInstant(), ZoneOffset.UTC)
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `returns items DESC by date with hasMore false on small ranges`() =
        testApplication {
            application { listDailyPuzzlesModule(seed = LocalDate.parse("2026-05-12")..today) }

            val response = client.get("/v1/puzzles/daily/list")

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.headers["Content-Type"]!!).startsWith("application/json")
            val body: ListDailyPuzzlesResponseDto = json.decodeFromString(response.bodyAsText())
            assertThat(body.items.map { it.date }).containsExactly(
                "2026-05-16",
                "2026-05-15",
                "2026-05-14",
                "2026-05-13",
                "2026-05-12",
            )
            assertThat(body.hasMore).isFalse()
        }

    @Test
    fun `respects from and to query parameters`() =
        testApplication {
            application { listDailyPuzzlesModule(seed = LocalDate.parse("2026-05-07")..today) }

            val response = client.get("/v1/puzzles/daily/list?from=2026-05-10&to=2026-05-12")

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val body: ListDailyPuzzlesResponseDto = json.decodeFromString(response.bodyAsText())
            assertThat(body.items).hasSize(3)
            assertThat(body.items.map { it.date }).containsExactly("2026-05-12", "2026-05-11", "2026-05-10")
            assertThat(body.hasMore).isFalse()
        }

    @Test
    fun `returns 400 invalid-puzzle-date for malformed from param`() =
        testApplication {
            application { listDailyPuzzlesModule(seed = LocalDate.parse("2026-05-12")..today) }

            val response = client.get("/v1/puzzles/daily/list?from=not-a-date")

            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(response.headers["Content-Type"]!!).startsWith("application/problem+json")
            assertThat(response.bodyAsText()).contains("invalid-puzzle-date")
        }

    @Test
    fun `returns 400 invalid-puzzle-date for malformed to param`() =
        testApplication {
            application { listDailyPuzzlesModule(seed = LocalDate.parse("2026-05-12")..today) }

            val response = client.get("/v1/puzzles/daily/list?to=garbage")

            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(response.bodyAsText()).contains("invalid-puzzle-date")
        }

    @Test
    fun `returns empty items when range entirely before launch anchor`() =
        testApplication {
            application { listDailyPuzzlesModule(seed = LocalDate.parse("2026-05-12")..today) }

            val response = client.get("/v1/puzzles/daily/list?from=2024-01-01&to=2024-12-31")

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val body: ListDailyPuzzlesResponseDto = json.decodeFromString(response.bodyAsText())
            assertThat(body.items).isEmpty()
            assertThat(body.hasMore).isFalse()
        }

    @Test
    fun `returns hasMore true when range exceeds maxItems`() =
        testApplication {
            application { listDailyPuzzlesModule(seed = LocalDate.parse("2026-05-10")..today, maxItems = 3) }

            val response = client.get("/v1/puzzles/daily/list?from=2026-05-10&to=2026-05-16")

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val body: ListDailyPuzzlesResponseDto = json.decodeFromString(response.bodyAsText())
            assertThat(body.items).hasSize(3)
            assertThat(body.hasMore).isTrue()
            assertThat(body.items.map { it.date }).containsExactly("2026-05-16", "2026-05-15", "2026-05-14")
        }

    @Test
    fun `items carry totalLetterCells from the persisted summary`() =
        testApplication {
            application { listDailyPuzzlesModule(seed = LocalDate.parse("2026-05-15")..today) }

            val body: ListDailyPuzzlesResponseDto =
                json.decodeFromString(client.get("/v1/puzzles/daily/list").bodyAsText())

            assertThat(body.items.all { it.totalLetterCells == 5 }).isTrue()
        }

    @Test
    fun `list emits public no-cache and a strong 16-hex etag, stable across identical calls`() =
        testApplication {
            application { listDailyPuzzlesModule(seed = LocalDate.parse("2026-05-12")..today) }

            val first = client.get("/v1/puzzles/daily/list")
            val second = client.get("/v1/puzzles/daily/list")

            assertThat(first.headers["Cache-Control"]!!).isEqualTo("public, no-cache")
            val etag = first.headers["ETag"]!!
            assertThat(etag).matches(Regex("\"[0-9a-f]{16}\""))
            assertThat(second.headers["ETag"]!!).isEqualTo(etag)
        }

    @Test
    fun `list answers 304 with empty body on matching If-None-Match`() =
        testApplication {
            application { listDailyPuzzlesModule(seed = LocalDate.parse("2026-05-12")..today) }

            val etag = client.get("/v1/puzzles/daily/list").headers["ETag"]!!
            val response =
                client.get("/v1/puzzles/daily/list") {
                    header(HttpHeaders.IfNoneMatch, etag)
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.NotModified)
            assertThat(response.bodyAsText()).isEqualTo("")
            assertThat(response.headers["Cache-Control"]!!).isEqualTo("public, no-cache")
            assertThat(response.headers["ETag"]!!).isEqualTo(etag)
        }

    @Test
    fun `list answers 304 when If-None-Match carries the weak form of the current etag`() =
        testApplication {
            application { listDailyPuzzlesModule(seed = LocalDate.parse("2026-05-12")..today) }

            val etag = client.get("/v1/puzzles/daily/list").headers["ETag"]!!
            val response =
                client.get("/v1/puzzles/daily/list") {
                    header(HttpHeaders.IfNoneMatch, "W/$etag")
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.NotModified)
            assertThat(response.bodyAsText()).isEqualTo("")
            assertThat(response.headers["ETag"]!!).isEqualTo(etag)
        }

    @Test
    fun `list etag flips when the id set changes so a stale If-None-Match gets 200`() =
        testApplication {
            val repo = InMemoryPuzzleRepository()
            application { listDailyPuzzlesModule(seed = LocalDate.parse("2026-05-12")..today, puzzleRepo = repo) }

            val etag = client.get("/v1/puzzles/daily/list").headers["ETag"]!!
            // Regenerating a date inserts a newer row whose fresh id wins (ADR-0081).
            repo.insertDaily(UUID.randomUUID(), today, stubStoredPuzzle())
            val response =
                client.get("/v1/puzzles/daily/list") {
                    header(HttpHeaders.IfNoneMatch, etag)
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.headers["ETag"]!!).isNotEqualTo(etag)
        }

    @Test
    fun `list etag flips when a backfilled older date flips hasMore with identical visible ids`() =
        testApplication {
            val repo = InMemoryPuzzleRepository()
            application {
                listDailyPuzzlesModule(seed = LocalDate.parse("2026-05-14")..today, maxItems = 3, puzzleRepo = repo)
            }

            val first = client.get("/v1/puzzles/daily/list")
            val etag = first.headers["ETag"]!!
            assertThat(json.decodeFromString<ListDailyPuzzlesResponseDto>(first.bodyAsText()).hasMore).isFalse()

            // Truncation drops the OLDEST end, so a backfilled older date flips hasMore while the visible ids stay identical.
            repo.insertDaily(UUID.randomUUID(), LocalDate.parse("2026-05-13"), stubStoredPuzzle())
            val response =
                client.get("/v1/puzzles/daily/list") {
                    header(HttpHeaders.IfNoneMatch, etag)
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.headers["ETag"]!!).isNotEqualTo(etag)
            val body: ListDailyPuzzlesResponseDto = json.decodeFromString(response.bodyAsText())
            assertThat(body.hasMore).isTrue()
            assertThat(body.items.map { it.date }).containsExactly("2026-05-16", "2026-05-15", "2026-05-14")
        }

    @Test
    fun `list 400 carries no cache headers`() =
        testApplication {
            application { listDailyPuzzlesModule(seed = LocalDate.parse("2026-05-12")..today) }

            val response = client.get("/v1/puzzles/daily/list?from=not-a-date")

            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(response.headers["Cache-Control"]).isNull()
            assertThat(response.headers["ETag"]).isNull()
        }

    private fun Application.listDailyPuzzlesModule(
        seed: ClosedRange<LocalDate>,
        maxItems: Int = ListDailyPuzzlesUseCase.DEFAULT_MAX_ITEMS,
        puzzleRepo: InMemoryPuzzleRepository = InMemoryPuzzleRepository(),
    ) {
        install(ContentNegotiation) {
            json(
                Json {
                    ignoreUnknownKeys = true
                    explicitNulls = false
                },
            )
        }
        val hintRepo = InMemoryHintUsageRepository()
        val selector = DailyPuzzleSelector()

        var d = seed.start
        while (!d.isAfter(seed.endInclusive)) {
            puzzleRepo.insertDaily(UUID.randomUUID(), d, stubStoredPuzzle())
            d = d.plusDays(1)
        }

        val gen = GeneratePuzzleUseCase(EmptyWordRepository, defaultPuzzleConstraints())
        routing {
            puzzles(
                loadOrGenerate = LoadOrGeneratePuzzleUseCase(puzzleRepo, gen),
                revealCellHint = RevealCellHintUseCase(puzzleRepo, hintRepo),
                validatePuzzle = ValidatePuzzleUseCase(puzzleRepo),
                validateWord = ValidateWordUseCase(puzzleRepo),
                listDailyPuzzles =
                    ListDailyPuzzlesUseCase(
                        puzzleRepository = puzzleRepo,
                        dailyPuzzleSelector = selector,
                        maxItems = maxItems,
                    ),
                puzzleRepository = puzzleRepo,
                hintUsageRepository = hintRepo,
                hintWriteCoordinator = InMemoryHintWriteCoordinator(),
                cookieVerifier = FakeCookieVerifier(),
                dailyPuzzleSelector = selector,
                clock = fixedClock,
            )
        }
    }

    private fun stubStoredPuzzle(): StoredPuzzle {
        val word = Word(text = "ABCDE", definition = "test")
        val placement =
            WordPlacement(
                word = word,
                cluePosition = Position(Row(0), Column(0)),
                direction = Direction.DOWN_RIGHT,
                chosenClue = word.clues.first(),
            )
        return StoredPuzzle(
            grid = Grid.fromPlacements(width = 6, height = 6, placements = listOf(placement)),
            title = "t",
            language = "fr",
            hintsAllowed = 3,
            createdAt = Instant.parse("2026-05-13T00:00:00Z"),
        )
    }

    private object EmptyWordRepository : WordRepository {
        override fun findByLength(length: Int): List<Word> = emptyList()

        override fun findByLengthAndPattern(
            length: Int,
            pattern: Map<Int, Char>,
        ): List<Word> = emptyList()

        override fun containsLemma(text: String): Boolean = false
    }
}
