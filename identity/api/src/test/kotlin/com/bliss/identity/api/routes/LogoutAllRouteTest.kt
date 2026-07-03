package com.bliss.identity.api.routes

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import com.bliss.identity.api.Wiring
import com.bliss.identity.api.auth.SessionCookies
import com.bliss.identity.api.config.AppleClientConfig
import com.bliss.identity.api.config.GoogleClientConfig
import com.bliss.identity.api.config.IdentityApiConfig
import com.bliss.identity.api.module
import com.bliss.identity.application.usecases.LogoutAllUseCase
import com.bliss.identity.application.usecases.WhoAmIUseCase
import com.bliss.identity.domain.session.Session
import com.bliss.identity.domain.session.SessionId
import com.bliss.identity.domain.user.DisplayName
import com.bliss.identity.domain.user.User
import com.bliss.identity.domain.user.UserId
import com.bliss.identity.infrastructure.persistence.InMemorySessionRepository
import com.bliss.identity.infrastructure.persistence.InMemoryUserRepository
import com.bliss.identity.infrastructure.testdoubles.FixedClock
import io.ktor.client.request.cookie
import io.ktor.client.request.post
import io.ktor.http.HttpStatusCode
import io.ktor.http.setCookie
import io.ktor.server.testing.testApplication
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import java.util.UUID

class LogoutAllRouteTest {
    private val now: Instant = Instant.parse("2026-07-03T12:00:00Z")
    private val userId = UserId(UUID.randomUUID())
    private val currentSession = SessionId(UUID.randomUUID())
    private val otherSession = SessionId(UUID.randomUUID())

    private val testConfig =
        IdentityApiConfig(
            port = 0,
            publicHost = "localhost",
            google = GoogleClientConfig("g-client", "g-secret"),
            apple = AppleClientConfig("a-svc", "a-team", "a-key", "-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----"),
            allowedReturnOrigins = listOf("https://wordsparrow.example"),
        )

    private data class Fixture(
        val wiring: Wiring,
        val sessions: InMemorySessionRepository,
    )

    private fun newFixture(): Fixture {
        val users = InMemoryUserRepository()
        val sessions = InMemorySessionRepository()
        runBlocking {
            users.create(User(userId, DisplayName.of("Alice"), now, now))
            sessions.create(Session(currentSession, userId, now, now, null))
            sessions.create(Session(otherSession, userId, now, now, null))
        }
        val clock = FixedClock(now)
        val whoAmI = WhoAmIUseCase(users, sessions, clock, Duration.ofDays(7))
        val logoutAll = LogoutAllUseCase(sessions, clock)
        return Fixture(Wiring.forTesting(whoAmI = whoAmI, logoutAll = logoutAll), sessions)
    }

    @Test
    fun `no cookie returns 401`() =
        testApplication {
            application { module(newFixture().wiring, testConfig) }
            val response = client.post("/v1/auth/logout-all")
            assertThat(response.status).isEqualTo(HttpStatusCode.Unauthorized)
        }

    @Test
    fun `revokes other sessions and keeps the caller signed in with 204`() =
        testApplication {
            val fixture = newFixture()
            application { module(fixture.wiring, testConfig) }
            val response =
                client.post("/v1/auth/logout-all") {
                    cookie(SessionCookies.NAME, currentSession.value.toString())
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.NoContent)
            assertThat(response.setCookie().firstOrNull { it.name == SessionCookies.NAME }).isNull()

            val caller = runBlocking { fixture.sessions.findById(currentSession) }
            assertThat(caller).isNotNull()
            assertThat(caller!!.revokedAt).isNull()
            val other = runBlocking { fixture.sessions.findById(otherSession) }
            assertThat(other!!.revokedAt).isNotNull()
        }
}
