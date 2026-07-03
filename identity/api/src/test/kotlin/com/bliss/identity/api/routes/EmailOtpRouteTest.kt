package com.bliss.identity.api.routes

import assertk.assertThat
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isNotNull
import assertk.assertions.isTrue
import com.bliss.identity.api.Wiring
import com.bliss.identity.api.auth.ChallengeCookies
import com.bliss.identity.api.auth.SessionCookies
import com.bliss.identity.api.config.AppleClientConfig
import com.bliss.identity.api.config.GoogleClientConfig
import com.bliss.identity.api.config.IdentityApiConfig
import com.bliss.identity.api.module
import com.bliss.identity.application.ports.EmailSender
import com.bliss.identity.application.usecases.LogoutAllUseCase
import com.bliss.identity.application.usecases.RequestEmailOtpUseCase
import com.bliss.identity.application.usecases.VerifyEmailOtpUseCase
import com.bliss.identity.application.usecases.WhoAmIUseCase
import com.bliss.identity.infrastructure.auth.SecureRandomFactory
import com.bliss.identity.infrastructure.auth.Sha256TokenHasher
import com.bliss.identity.infrastructure.email.EmailSendFailed
import com.bliss.identity.infrastructure.id.UuidV7IdGenerator
import com.bliss.identity.infrastructure.persistence.InMemorySessionRepository
import com.bliss.identity.infrastructure.persistence.InMemoryUserProviderRepository
import com.bliss.identity.infrastructure.persistence.InMemoryUserRepository
import com.bliss.identity.infrastructure.testdoubles.FixedClock
import com.bliss.identity.infrastructure.testdoubles.InMemoryEmailOtpChallengeRepository
import com.bliss.identity.infrastructure.testdoubles.RecordingEmailSender
import io.ktor.client.request.cookie
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.setCookie
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant

class EmailOtpRouteTest {
    private val now: Instant = Instant.parse("2026-07-03T12:00:00Z")

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
        val emailSender: RecordingEmailSender,
    )

    private fun newFixture(emailSender: EmailSender = RecordingEmailSender()): Fixture {
        val challenges = InMemoryEmailOtpChallengeRepository()
        val users = InMemoryUserRepository()
        val userProviders = InMemoryUserProviderRepository()
        val sessions = InMemorySessionRepository()
        val clock = FixedClock(now)
        val hasher = Sha256TokenHasher()
        val random = SecureRandomFactory()
        val idGen = UuidV7IdGenerator()
        val whoAmI = WhoAmIUseCase(users, sessions, clock, Duration.ofDays(7))
        val requestEmailOtp = RequestEmailOtpUseCase(challenges, emailSender, hasher, random, idGen, clock)
        val verifyEmailOtp = VerifyEmailOtpUseCase(challenges, hasher, users, userProviders, sessions, idGen, clock)
        val recorder = emailSender as? RecordingEmailSender ?: RecordingEmailSender()
        return Fixture(
            Wiring.forTesting(whoAmI = whoAmI, requestEmailOtp = requestEmailOtp, verifyEmailOtp = verifyEmailOtp),
            recorder,
        )
    }

    private suspend fun ApplicationTestBuilder.start(
        email: String,
        cookieSecret: String? = null,
    ): HttpResponse =
        client.post("/v1/auth/email/start") {
            contentType(ContentType.Application.Json)
            if (cookieSecret != null) cookie(ChallengeCookies.NAME, cookieSecret)
            setBody("""{"email":"$email"}""")
        }

    @Test
    fun `start emails a code and returns 202 with challenge cookie`() =
        testApplication {
            val fixture = newFixture()
            application { module(fixture.wiring, testConfig) }
            val response = start("player@example.com")
            assertThat(response.status).isEqualTo(HttpStatusCode.Accepted)
            val cookie = response.setCookie().firstOrNull { it.name == ChallengeCookies.NAME }
            assertThat(cookie).isNotNull()
            assertThat(cookie!!.domain).isEqualTo(ChallengeCookies.DOMAIN)
            assertThat(fixture.emailSender.sent).hasSize(1)
        }

    @Test
    fun `start with malformed email returns 400`() =
        testApplication {
            val fixture = newFixture()
            application { module(fixture.wiring, testConfig) }
            val response = start("not-an-email")
            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
        }

    @Test
    fun `start twice for the same email is rate limited with 429`() =
        testApplication {
            val fixture = newFixture()
            application { module(fixture.wiring, testConfig) }
            start("player@example.com")
            val second = start("player@example.com")
            assertThat(second.status).isEqualTo(HttpStatusCode.TooManyRequests)
        }

    @Test
    fun `start returns 502 when email delivery fails`() =
        testApplication {
            val fixture = newFixture(emailSender = EmailSender { _, _ -> throw EmailSendFailed(500) })
            application { module(fixture.wiring, testConfig) }
            val response = start("player@example.com")
            assertThat(response.status).isEqualTo(HttpStatusCode.BadGateway)
        }

    @Test
    fun `verify with matching code and cookie mints a session and returns 200`() =
        testApplication {
            val fixture = newFixture()
            application { module(fixture.wiring, testConfig) }
            val startResponse = start("player@example.com")
            val secret = startResponse.setCookie().first { it.name == ChallengeCookies.NAME }.value
            val code =
                fixture.emailSender.sent
                    .first()
                    .code.value

            val response =
                client.post("/v1/auth/email/verify") {
                    contentType(ContentType.Application.Json)
                    cookie(ChallengeCookies.NAME, secret)
                    setBody("""{"email":"player@example.com","code":"$code"}""")
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.bodyAsText().contains("\"userId\"")).isTrue()
            val session = response.setCookie().firstOrNull { it.name == SessionCookies.NAME }
            assertThat(session).isNotNull()
            val clearedChallenge = response.setCookie().firstOrNull { it.name == ChallengeCookies.NAME }
            assertThat(clearedChallenge).isNotNull()
            assertThat(clearedChallenge!!.maxAge).isEqualTo(0)
        }

    @Test
    fun `verify without an active challenge returns a uniform 401`() =
        testApplication {
            val fixture = newFixture()
            application { module(fixture.wiring, testConfig) }
            val response =
                client.post("/v1/auth/email/verify") {
                    contentType(ContentType.Application.Json)
                    setBody("""{"email":"player@example.com","code":"123456"}""")
                }
            assertThat(response.status).isEqualTo(HttpStatusCode.Unauthorized)
        }

    @Test
    fun `start and verify are not mounted when the otp use cases are absent`() =
        testApplication {
            val users = InMemoryUserRepository()
            val sessions = InMemorySessionRepository()
            val clock = FixedClock(now)
            val whoAmI = WhoAmIUseCase(users, sessions, clock, Duration.ofDays(7))
            val wiring = Wiring.forTesting(whoAmI = whoAmI, logoutAll = LogoutAllUseCase(sessions, clock))
            application { module(wiring, testConfig) }

            val startResponse =
                client.post("/v1/auth/email/start") {
                    contentType(ContentType.Application.Json)
                    setBody("""{"email":"player@example.com"}""")
                }
            assertThat(startResponse.status).isEqualTo(HttpStatusCode.NotFound)

            val verifyResponse =
                client.post("/v1/auth/email/verify") {
                    contentType(ContentType.Application.Json)
                    setBody("""{"email":"player@example.com","code":"123456"}""")
                }
            assertThat(verifyResponse.status).isEqualTo(HttpStatusCode.NotFound)
        }
}
