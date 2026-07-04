package com.bliss.identity.infrastructure.usecases

import assertk.assertFailure
import assertk.assertThat
import assertk.assertions.hasSize
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import com.bliss.identity.application.usecases.RequestEmailOtpCommand
import com.bliss.identity.application.usecases.RequestEmailOtpResult
import com.bliss.identity.application.usecases.RequestEmailOtpUseCase
import com.bliss.identity.domain.auth.ChallengeId
import com.bliss.identity.domain.auth.ChallengeSecret
import com.bliss.identity.domain.auth.EmailOtpChallenge
import com.bliss.identity.domain.auth.OtpCode
import com.bliss.identity.domain.user.EmailAddress
import com.bliss.identity.infrastructure.testdoubles.FakeTokenHasher
import com.bliss.identity.infrastructure.testdoubles.FixedClock
import com.bliss.identity.infrastructure.testdoubles.FixedIdGenerator
import com.bliss.identity.infrastructure.testdoubles.FixedRandomFactory
import com.bliss.identity.infrastructure.testdoubles.InMemoryEmailOtpChallengeRepository
import com.bliss.identity.infrastructure.testdoubles.RecordingEmailSender
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import java.util.UUID

class RequestEmailOtpUseCaseTest {
    private val now: Instant = Instant.parse("2026-07-03T12:00:00Z")
    private val code = OtpCode.of("123456")
    private val secret = ChallengeSecret.of("otp-binding-secret-aaaabbbbccccddddeeeeffff")
    private val challengeId = UUID.fromString("01890c5e-0000-7000-8000-0000000c0f01")
    private val secondCode = OtpCode.of("654321")
    private val secondSecret = ChallengeSecret.of("second-binding-secret-aaaabbbbccccddddeeee")
    private val secondChallengeId = UUID.fromString("01890c5e-0000-7000-8000-0000000c0f02")

    private class Fixture(
        val repo: InMemoryEmailOtpChallengeRepository,
        val sender: RecordingEmailSender,
        val hasher: FakeTokenHasher,
        val clock: FixedClock,
        val useCase: RequestEmailOtpUseCase,
    )

    private fun fixture(
        codes: List<OtpCode> = listOf(code),
        secrets: List<ChallengeSecret> = listOf(secret),
        challengeIds: List<UUID> = listOf(challengeId),
        cooldown: Duration = Duration.ofSeconds(60),
        dailyCap: Int = 8,
        monthlyCap: Int = 4500,
    ): Fixture {
        val repo = InMemoryEmailOtpChallengeRepository()
        val sender = RecordingEmailSender()
        val hasher = FakeTokenHasher()
        val clock = FixedClock(now)
        val useCase =
            RequestEmailOtpUseCase(
                challenges = repo,
                emailSender = sender,
                hasher = hasher,
                randomFactory = FixedRandomFactory(otpCodes = codes, challengeSecrets = secrets),
                idGenerator = FixedIdGenerator(challengeIds = challengeIds),
                clock = clock,
                cooldown = cooldown,
                dailyCap = dailyCap,
                monthlyCap = monthlyCap,
            )
        return Fixture(repo, sender, hasher, clock, useCase)
    }

    private fun seededChallenge(id: UUID): EmailOtpChallenge =
        EmailOtpChallenge(
            id = ChallengeId(id),
            email = EmailAddress.of("seed@example.com"),
            codeHash = "seed-code-hash",
            bindingHash = "seed-binding-hash",
            attempts = 0,
            createdAt = now,
            expiresAt = now.plus(Duration.ofMinutes(10)),
            consumedAt = null,
        )

    @Test
    fun `sends the code and stores the hashed code and binding secret`() =
        runTest {
            val f = fixture()

            val result = f.useCase.execute(RequestEmailOtpCommand("  Player@Example.COM "))

            assertThat(result).isInstanceOf(RequestEmailOtpResult.Sent::class)
            val sent = result as RequestEmailOtpResult.Sent
            val email = EmailAddress.of("player@example.com")
            assertThat(f.sender.sent).hasSize(1)
            assertThat(f.sender.sent[0].to).isEqualTo(email)
            val stored = f.repo.findActiveByEmail(email, now)
            assertThat(stored).isNotNull()
            assertThat(stored!!.codeHash).isEqualTo(
                f.hasher.hash(
                    f.sender.sent[0]
                        .code.value,
                ),
            )
            assertThat(stored.bindingHash).isEqualTo(f.hasher.hash(sent.challengeSecret))
            assertThat(stored.expiresAt).isEqualTo(now.plus(Duration.ofMinutes(10)))
            assertThat(stored.attempts).isEqualTo(0)
            assertThat(stored.consumedAt).isNull()
        }

    @Test
    fun `second request within the cooldown is rate limited and sends no second email`() =
        runTest {
            val f =
                fixture(
                    codes = listOf(code, secondCode),
                    secrets = listOf(secret, secondSecret),
                    challengeIds = listOf(challengeId, secondChallengeId),
                )

            f.useCase.execute(RequestEmailOtpCommand("player@example.com"))
            val second = f.useCase.execute(RequestEmailOtpCommand("player@example.com"))

            assertThat(second).isEqualTo(RequestEmailOtpResult.RateLimited)
            assertThat(f.sender.sent).hasSize(1)
        }

    @Test
    fun `request past the daily cap is rate limited`() =
        runTest {
            val f =
                fixture(
                    codes = listOf(code, secondCode),
                    secrets = listOf(secret, secondSecret),
                    challengeIds = listOf(challengeId, secondChallengeId),
                    cooldown = Duration.ofSeconds(1),
                    dailyCap = 2,
                )

            f.useCase.execute(RequestEmailOtpCommand("player@example.com"))
            f.clock.advanceBy(2)
            f.useCase.execute(RequestEmailOtpCommand("player@example.com"))
            f.clock.advanceBy(2)
            val third = f.useCase.execute(RequestEmailOtpCommand("player@example.com"))

            assertThat(third).isEqualTo(RequestEmailOtpResult.RateLimited)
            assertThat(f.sender.sent).hasSize(2)
        }

    @Test
    fun `request past the monthly budget is budget exhausted and sends nothing`() =
        runTest {
            val f = fixture(monthlyCap = 2)
            f.repo.create(seededChallenge(UUID.fromString("01890c5e-0000-7000-8000-0000000c0b01")))
            f.repo.create(seededChallenge(UUID.fromString("01890c5e-0000-7000-8000-0000000c0b02")))

            val result = f.useCase.execute(RequestEmailOtpCommand("player@example.com"))

            assertThat(result).isEqualTo(RequestEmailOtpResult.BudgetExhausted)
            assertThat(f.sender.sent).isEmpty()
            assertThat(f.repo.countAllCreatedSince(Instant.EPOCH)).isEqualTo(2)
        }

    @Test
    fun `request below the monthly budget still sends`() =
        runTest {
            val f = fixture(monthlyCap = 2)
            f.repo.create(seededChallenge(UUID.fromString("01890c5e-0000-7000-8000-0000000c0b01")))

            val result = f.useCase.execute(RequestEmailOtpCommand("player@example.com"))

            assertThat(result).isInstanceOf(RequestEmailOtpResult.Sent::class)
            assertThat(f.sender.sent).hasSize(1)
            assertThat(f.repo.countAllCreatedSince(Instant.EPOCH)).isEqualTo(2)
        }

    @Test
    fun `malformed email throws IllegalArgumentException`() =
        runTest {
            val f = fixture()

            assertFailure { f.useCase.execute(RequestEmailOtpCommand("not-an-email")) }
                .isInstanceOf(IllegalArgumentException::class)
        }
}
