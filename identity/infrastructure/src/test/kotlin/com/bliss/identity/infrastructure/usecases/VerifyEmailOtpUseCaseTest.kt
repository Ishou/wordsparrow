package com.bliss.identity.infrastructure.usecases

import assertk.assertFailure
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import assertk.assertions.isTrue
import com.bliss.identity.application.ports.EmailOtpChallengeRepository
import com.bliss.identity.application.usecases.VerifyEmailOtpCommand
import com.bliss.identity.application.usecases.VerifyEmailOtpError
import com.bliss.identity.application.usecases.VerifyEmailOtpUseCase
import com.bliss.identity.domain.auth.ChallengeId
import com.bliss.identity.domain.auth.EmailOtpChallenge
import com.bliss.identity.domain.provider.Provider
import com.bliss.identity.domain.provider.Subject
import com.bliss.identity.domain.provider.UserProvider
import com.bliss.identity.domain.session.SessionId
import com.bliss.identity.domain.user.DisplayName
import com.bliss.identity.domain.user.EmailAddress
import com.bliss.identity.domain.user.User
import com.bliss.identity.domain.user.UserId
import com.bliss.identity.infrastructure.persistence.InMemorySessionRepository
import com.bliss.identity.infrastructure.persistence.InMemoryUserProviderRepository
import com.bliss.identity.infrastructure.persistence.InMemoryUserRepository
import com.bliss.identity.infrastructure.testdoubles.FakeTokenHasher
import com.bliss.identity.infrastructure.testdoubles.FixedClock
import com.bliss.identity.infrastructure.testdoubles.FixedIdGenerator
import com.bliss.identity.infrastructure.testdoubles.InMemoryEmailOtpChallengeRepository
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class VerifyEmailOtpUseCaseTest {
    private val now: Instant = Instant.parse("2026-07-04T12:00:00Z")
    private val emailRaw = "alice@example.com"
    private val email = EmailAddress.of(emailRaw)
    private val subject = Subject.of(email.value)
    private val correctCode = "123456"
    private val correctSecret = "binding-secret-abcdef"

    private val challengeId = ChallengeId(UUID.fromString("01890c5e-0000-7000-8000-0000000000c1"))
    private val newUserId = UUID.fromString("01890c5e-0000-7000-8000-00000000bb01")
    private val newSessionId = UUID.fromString("01890c5e-0000-7000-8000-00000000cc01")

    private val hasher = FakeTokenHasher()

    private fun challenge(
        attempts: Int = 0,
        createdAt: Instant = now.minusSeconds(60),
        expiresAt: Instant = now.plusSeconds(540),
        consumedAt: Instant? = null,
    ): EmailOtpChallenge =
        EmailOtpChallenge(
            id = challengeId,
            email = email,
            codeHash = hasher.hash(correctCode),
            bindingHash = hasher.hash(correctSecret),
            attempts = attempts,
            createdAt = createdAt,
            expiresAt = expiresAt,
            consumedAt = consumedAt,
        )

    private data class Bundle(
        val challenges: EmailOtpChallengeRepository,
        val users: InMemoryUserRepository,
        val userProviders: InMemoryUserProviderRepository,
        val sessions: InMemorySessionRepository,
    )

    private fun newUseCase(
        challenges: EmailOtpChallengeRepository = InMemoryEmailOtpChallengeRepository(),
        users: InMemoryUserRepository = InMemoryUserRepository(),
        userProviders: InMemoryUserProviderRepository = InMemoryUserProviderRepository(),
        sessions: InMemorySessionRepository = InMemorySessionRepository(),
        userIds: List<UUID> = listOf(newUserId),
        sessionIds: List<UUID> = listOf(newSessionId),
    ): Pair<VerifyEmailOtpUseCase, Bundle> {
        val sut =
            VerifyEmailOtpUseCase(
                challenges = challenges,
                hasher = hasher,
                users = users,
                userProviders = userProviders,
                sessions = sessions,
                idGenerator = FixedIdGenerator(userIds = userIds, sessionIds = sessionIds),
                clock = FixedClock(now),
            )
        return sut to Bundle(challenges, users, userProviders, sessions)
    }

    private fun command(
        code: String = correctCode,
        cookieSecret: String? = correctSecret,
    ) = VerifyEmailOtpCommand(email = emailRaw, code = code, cookieSecret = cookieSecret)

    @Test
    fun `new email signup creates user, email link, and session`() =
        runTest {
            val challenges = InMemoryEmailOtpChallengeRepository().apply { create(challenge()) }
            val (sut, bundle) = newUseCase(challenges = challenges)
            val result = sut.execute(command())
            assertThat(result.userId).isEqualTo(UserId(newUserId))
            assertThat(result.sessionId).isEqualTo(SessionId(newSessionId))
            val user = bundle.users.findById(UserId(newUserId))
            assertThat(user).isNotNull()
            assertThat(user!!.email).isEqualTo(emailRaw)
            val link = bundle.userProviders.findByProviderAndSubject(Provider.EMAIL, subject)
            assertThat(link).isNotNull()
            assertThat(link!!.userId).isEqualTo(UserId(newUserId))
            assertThat(link.emailAtLink).isEqualTo(emailRaw)
            val session = bundle.sessions.findById(SessionId(newSessionId))
            assertThat(session).isNotNull()
            assertThat(session!!.isActive).isTrue()
        }

    @Test
    fun `existing email link resolves to the same account without creating a user`() =
        runTest {
            val existingId = UserId(UUID.fromString("01890c5e-0000-7000-8000-00000000dd01"))
            val users =
                InMemoryUserRepository().apply {
                    create(
                        User(
                            id = existingId,
                            displayName = DisplayName.of("Alice"),
                            createdAt = now.minusSeconds(86_400),
                            lastSeenAt = now.minusSeconds(86_400),
                            email = emailRaw,
                        ),
                    )
                }
            val userProviders =
                InMemoryUserProviderRepository().apply {
                    link(
                        UserProvider(
                            userId = existingId,
                            provider = Provider.EMAIL,
                            subject = subject,
                            emailAtLink = emailRaw,
                            linkedAt = now.minusSeconds(86_400),
                        ),
                    )
                }
            val challenges = InMemoryEmailOtpChallengeRepository().apply { create(challenge()) }
            val (sut, bundle) =
                newUseCase(
                    challenges = challenges,
                    users = users,
                    userProviders = userProviders,
                    userIds = emptyList(),
                )
            val result = sut.execute(command())
            assertThat(result.userId).isEqualTo(existingId)
            assertThat(bundle.users.findById(existingId)!!.lastSeenAt).isEqualTo(now)
        }

    @Test
    fun `collision - google user with matching email gets an email link on the same account`() =
        runTest {
            val googleId = UserId(UUID.fromString("01890c5e-0000-7000-8000-00000000aa09"))
            val users =
                InMemoryUserRepository().apply {
                    create(
                        User(
                            id = googleId,
                            displayName = DisplayName.of("Alice"),
                            createdAt = now.minusSeconds(86_400),
                            lastSeenAt = now.minusSeconds(86_400),
                            email = emailRaw,
                        ),
                    )
                }
            val userProviders =
                InMemoryUserProviderRepository().apply {
                    link(
                        UserProvider(
                            userId = googleId,
                            provider = Provider.GOOGLE,
                            subject = Subject.of("google-sub-1"),
                            emailAtLink = null,
                            linkedAt = now.minusSeconds(86_400),
                        ),
                    )
                }
            val challenges = InMemoryEmailOtpChallengeRepository().apply { create(challenge()) }
            val (sut, bundle) =
                newUseCase(
                    challenges = challenges,
                    users = users,
                    userProviders = userProviders,
                    userIds = emptyList(),
                )
            val result = sut.execute(command())
            assertThat(result.userId).isEqualTo(googleId)
            val emailLink = bundle.userProviders.findByProviderAndSubject(Provider.EMAIL, subject)
            assertThat(emailLink).isNotNull()
            assertThat(emailLink!!.userId).isEqualTo(googleId)
        }

    @Test
    fun `ambiguous - two users share the email so a fresh account is created`() =
        runTest {
            val firstId = UserId(UUID.fromString("01890c5e-0000-7000-8000-00000000dd02"))
            val secondId = UserId(UUID.fromString("01890c5e-0000-7000-8000-00000000dd03"))
            val users =
                InMemoryUserRepository().apply {
                    create(
                        User(
                            id = firstId,
                            displayName = DisplayName.of("Alice"),
                            createdAt = now.minusSeconds(86_400),
                            lastSeenAt = now.minusSeconds(86_400),
                            email = emailRaw,
                        ),
                    )
                    create(
                        User(
                            id = secondId,
                            displayName = DisplayName.of("Alice2"),
                            createdAt = now.minusSeconds(86_400),
                            lastSeenAt = now.minusSeconds(86_400),
                            email = emailRaw,
                        ),
                    )
                }
            val challenges = InMemoryEmailOtpChallengeRepository().apply { create(challenge()) }
            val (sut, bundle) = newUseCase(challenges = challenges, users = users)
            val result = sut.execute(command())
            assertThat(result.userId).isEqualTo(UserId(newUserId))
            val emailLink = bundle.userProviders.findByProviderAndSubject(Provider.EMAIL, subject)
            assertThat(emailLink!!.userId).isEqualTo(UserId(newUserId))
        }

    @Test
    fun `missing cookie secret throws BindingMismatch and increments the attempt`() =
        runTest {
            val challenges = InMemoryEmailOtpChallengeRepository().apply { create(challenge()) }
            val (sut, bundle) = newUseCase(challenges = challenges)
            assertFailure { sut.execute(command(cookieSecret = null)) }
                .isInstanceOf(VerifyEmailOtpError.BindingMismatch::class)
            assertThat(bundle.challenges.findActiveByEmail(email, now)!!.attempts).isEqualTo(1)
        }

    @Test
    fun `wrong binding secret throws BindingMismatch and increments the attempt`() =
        runTest {
            val challenges = InMemoryEmailOtpChallengeRepository().apply { create(challenge()) }
            val (sut, bundle) = newUseCase(challenges = challenges)
            assertFailure { sut.execute(command(cookieSecret = "not-the-secret")) }
                .isInstanceOf(VerifyEmailOtpError.BindingMismatch::class)
            assertThat(bundle.challenges.findActiveByEmail(email, now)!!.attempts).isEqualTo(1)
        }

    @Test
    fun `wrong code throws CodeMismatch and increments the attempt`() =
        runTest {
            val challenges = InMemoryEmailOtpChallengeRepository().apply { create(challenge()) }
            val (sut, bundle) = newUseCase(challenges = challenges)
            assertFailure { sut.execute(command(code = "000000")) }
                .isInstanceOf(VerifyEmailOtpError.CodeMismatch::class)
            assertThat(bundle.challenges.findActiveByEmail(email, now)!!.attempts).isEqualTo(1)
        }

    @Test
    fun `wrong code that reaches the cap still throws CodeMismatch and persists the lock`() =
        runTest {
            val challenges =
                InMemoryEmailOtpChallengeRepository().apply {
                    create(challenge(attempts = EmailOtpChallenge.MAX_ATTEMPTS - 1))
                }
            val (sut, bundle) = newUseCase(challenges = challenges)
            assertFailure { sut.execute(command(code = "000000")) }
                .isInstanceOf(VerifyEmailOtpError.CodeMismatch::class)
            assertThat(bundle.challenges.findActiveByEmail(email, now)!!.attempts)
                .isEqualTo(EmailOtpChallenge.MAX_ATTEMPTS)
        }

    @Test
    fun `challenge at the attempt cap throws Locked`() =
        runTest {
            val challenges =
                InMemoryEmailOtpChallengeRepository().apply {
                    create(challenge(attempts = EmailOtpChallenge.MAX_ATTEMPTS))
                }
            val (sut, _) = newUseCase(challenges = challenges)
            assertFailure { sut.execute(command()) }
                .isInstanceOf(VerifyEmailOtpError.Locked::class)
        }

    @Test
    fun `expired challenge throws Expired`() =
        runTest {
            val expired = challenge(expiresAt = now.minusSeconds(1))
            val (sut, _) = newUseCase(challenges = SingleChallengeRepository(expired))
            assertFailure { sut.execute(command()) }
                .isInstanceOf(VerifyEmailOtpError.Expired::class)
        }

    @Test
    fun `no active challenge throws NoChallenge`() =
        runTest {
            val (sut, bundle) = newUseCase()
            assertFailure { sut.execute(command()) }
                .isInstanceOf(VerifyEmailOtpError.NoChallenge::class)
            assertThat(bundle.sessions.findById(SessionId(newSessionId))).isNull()
        }

    // findActiveByEmail filters expired rows, so an expired-but-returned challenge needs a direct seam.
    private class SingleChallengeRepository(
        private val stored: EmailOtpChallenge,
    ) : EmailOtpChallengeRepository {
        override suspend fun create(challenge: EmailOtpChallenge) = Unit

        override suspend fun findActiveByEmail(
            email: EmailAddress,
            now: Instant,
        ): EmailOtpChallenge = stored

        override suspend fun save(challenge: EmailOtpChallenge) = Unit

        override suspend fun countCreatedSince(
            email: EmailAddress,
            since: Instant,
        ): Int = 0

        override suspend fun countAllCreatedSince(since: Instant): Int = 0

        override suspend fun latestCreatedAt(email: EmailAddress): Instant? = null

        override suspend fun deleteExpired(now: Instant) = Unit
    }
}
