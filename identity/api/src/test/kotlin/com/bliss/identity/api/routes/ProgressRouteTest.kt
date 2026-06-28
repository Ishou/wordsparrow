package com.bliss.identity.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import com.bliss.identity.api.Wiring
import com.bliss.identity.api.auth.SessionCookies
import com.bliss.identity.api.config.AppleClientConfig
import com.bliss.identity.api.config.GoogleClientConfig
import com.bliss.identity.api.config.IdentityApiConfig
import com.bliss.identity.api.module
import com.bliss.identity.application.usecases.GetProgressUseCase
import com.bliss.identity.application.usecases.ListProgressUseCase
import com.bliss.identity.application.usecases.MAX_PAYLOAD_BYTES
import com.bliss.identity.application.usecases.MAX_PUZZLES_PER_USER
import com.bliss.identity.application.usecases.PutProgressUseCase
import com.bliss.identity.application.usecases.WhoAmIUseCase
import com.bliss.identity.domain.progress.PuzzleId
import com.bliss.identity.domain.progress.PuzzleProgress
import com.bliss.identity.domain.session.Session
import com.bliss.identity.domain.session.SessionId
import com.bliss.identity.domain.user.DisplayName
import com.bliss.identity.domain.user.User
import com.bliss.identity.domain.user.UserId
import com.bliss.identity.infrastructure.persistence.InMemoryPuzzleProgressRepository
import com.bliss.identity.infrastructure.persistence.InMemorySessionRepository
import com.bliss.identity.infrastructure.persistence.InMemoryUserRepository
import com.bliss.identity.infrastructure.testdoubles.FixedClock
import io.ktor.client.request.cookie
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import java.util.UUID

class ProgressRouteTest {
    private val now: Instant = Instant.parse("2026-06-28T12:00:00Z")
    private val userId = UserId(UUID.randomUUID())
    private val sessionId = SessionId(UUID.randomUUID())
    private val puzzleId = UUID.randomUUID()

    private val testConfig =
        IdentityApiConfig(
            port = 0,
            publicHost = "localhost",
            google = GoogleClientConfig("g-client", "g-secret"),
            apple = AppleClientConfig("a-svc", "a-team", "a-key", "-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----"),
            allowedReturnOrigins = listOf("https://wordsparrow.example"),
        )

    private val repo = InMemoryPuzzleProgressRepository()

    private fun newWiring(progressRepo: InMemoryPuzzleProgressRepository = repo): Wiring {
        val users = InMemoryUserRepository()
        val sessions = InMemorySessionRepository()
        runBlocking {
            users.create(User(userId, DisplayName.of("Alice"), now, now))
            sessions.create(Session(sessionId, userId, now, now, null))
        }
        val whoAmI = WhoAmIUseCase(users, sessions, FixedClock(now), Duration.ofDays(7))
        return Wiring.forTesting(
            whoAmI = whoAmI,
            listProgress = ListProgressUseCase(progressRepo),
            getProgress = GetProgressUseCase(progressRepo),
            putProgress = PutProgressUseCase(progressRepo, FixedClock(now)),
        )
    }

    @Test
    fun `put without cookie returns 401`() =
        testApplication {
            application { module(newWiring(), testConfig) }
            val response =
                client.put("/v1/users/me/progress/$puzzleId") {
                    header(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    setBody("{\"payload\":{}}")
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.Unauthorized)
        }

    @Test
    fun `get for an unknown puzzle returns 404`() =
        testApplication {
            application { module(newWiring(), testConfig) }
            val response =
                client.get("/v1/users/me/progress/$puzzleId") {
                    cookie(SessionCookies.NAME, sessionId.value.toString())
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.NotFound)
        }

    @Test
    fun `put then list returns the stored entry`() =
        testApplication {
            application { module(newWiring(), testConfig) }
            client.put("/v1/users/me/progress/$puzzleId") {
                cookie(SessionCookies.NAME, sessionId.value.toString())
                header(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                setBody("{\"payload\":{\"cells\":{\"a1\":\"X\"}}}")
            }
            val response =
                client.get("/v1/users/me/progress") {
                    cookie(SessionCookies.NAME, sessionId.value.toString())
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val body = response.bodyAsText()
            assertThat(body).contains("\"puzzleId\":\"$puzzleId\"")
            assertThat(body).contains("\"updatedAt\":\"$now\"")
        }

    @Test
    fun `put with a stale baseUpdatedAt returns 409`() =
        testApplication {
            application { module(newWiring(), testConfig) }
            client.put("/v1/users/me/progress/$puzzleId") {
                cookie(SessionCookies.NAME, sessionId.value.toString())
                header(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                setBody("{\"payload\":{}}")
            }
            val response =
                client.put("/v1/users/me/progress/$puzzleId") {
                    cookie(SessionCookies.NAME, sessionId.value.toString())
                    header(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    setBody("{\"payload\":{\"a\":1},\"baseUpdatedAt\":\"2020-01-01T00:00:00Z\"}")
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.Conflict)
        }

    @Test
    fun `put with a non-object payload returns 400`() =
        testApplication {
            application { module(newWiring(), testConfig) }
            val response =
                client.put("/v1/users/me/progress/$puzzleId") {
                    cookie(SessionCookies.NAME, sessionId.value.toString())
                    header(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    setBody("{\"payload\":\"not-an-object\"}")
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
        }

    @Test
    fun `put with a non-UUID puzzleId returns 400`() =
        testApplication {
            application { module(newWiring(), testConfig) }
            val response =
                client.put("/v1/users/me/progress/not-a-uuid") {
                    cookie(SessionCookies.NAME, sessionId.value.toString())
                    header(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    setBody("{\"payload\":{}}")
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
        }

    @Test
    fun `put over the size cap returns 413`() =
        testApplication {
            application { module(newWiring(), testConfig) }
            val big = "a".repeat(MAX_PAYLOAD_BYTES + 1)
            val response =
                client.put("/v1/users/me/progress/$puzzleId") {
                    cookie(SessionCookies.NAME, sessionId.value.toString())
                    header(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    setBody("{\"payload\":{\"x\":\"$big\"}}")
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.PayloadTooLarge)
        }

    @Test
    fun `put over the rate limit returns 429`() =
        testApplication {
            application { module(newWiring(), testConfig, PutRateLimiter(maxPerWindow = 0)) }
            val response =
                client.put("/v1/users/me/progress/$puzzleId") {
                    cookie(SessionCookies.NAME, sessionId.value.toString())
                    header(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    setBody("{\"payload\":{}}")
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.TooManyRequests)
        }

    @Test
    fun `put when puzzle quota is exhausted returns 403`() {
        val fullRepo = InMemoryPuzzleProgressRepository()
        runBlocking {
            repeat(MAX_PUZZLES_PER_USER) {
                fullRepo.upsert(PuzzleProgress(userId, PuzzleId(UUID.randomUUID()), "{}", Instant.EPOCH), null)
            }
        }
        testApplication {
            application { module(newWiring(fullRepo), testConfig) }
            val response =
                client.put("/v1/users/me/progress/${UUID.randomUUID()}") {
                    cookie(SessionCookies.NAME, sessionId.value.toString())
                    header(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    setBody("{\"payload\":{}}")
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.Forbidden)
        }
    }
}
