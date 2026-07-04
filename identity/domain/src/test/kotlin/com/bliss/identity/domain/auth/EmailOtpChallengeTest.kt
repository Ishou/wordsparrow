package com.bliss.identity.domain.auth

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import com.bliss.identity.domain.user.EmailAddress
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class EmailOtpChallengeTest {
    private val createdAt = Instant.parse("2026-07-03T10:00:00Z")
    private val expiresAt = createdAt.plusSeconds(600)

    private fun challenge(
        attempts: Int = 0,
        consumedAt: Instant? = null,
    ) = EmailOtpChallenge(
        id = ChallengeId(UUID.randomUUID()),
        email = EmailAddress.of("alice@example.com"),
        codeHash = "hash-code",
        bindingHash = "hash-binding",
        attempts = attempts,
        accountExisted = false,
        createdAt = createdAt,
        expiresAt = expiresAt,
        consumedAt = consumedAt,
    )

    @Test
    fun `a fresh challenge is not expired, consumed, or locked`() {
        val c = challenge()
        assertThat(c.isExpired(createdAt)).isFalse()
        assertThat(c.isConsumed()).isFalse()
        assertThat(c.isLocked()).isFalse()
    }

    @Test
    fun `is not expired one instant before expiry`() {
        assertThat(challenge().isExpired(expiresAt.minusNanos(1))).isFalse()
    }

    @Test
    fun `is expired at the expiry instant (boundary inclusive)`() {
        assertThat(challenge().isExpired(expiresAt)).isTrue()
    }

    @Test
    fun `is expired after the expiry instant`() {
        assertThat(challenge().isExpired(expiresAt.plusSeconds(1))).isTrue()
    }

    @Test
    fun `withIncrementedAttempt bumps the attempt count`() {
        assertThat(challenge(attempts = 2).withIncrementedAttempt().attempts).isEqualTo(3)
    }

    @Test
    fun `becomes locked once attempts reach the max`() {
        assertThat(challenge(attempts = EmailOtpChallenge.MAX_ATTEMPTS - 1).isLocked()).isFalse()
        assertThat(challenge(attempts = EmailOtpChallenge.MAX_ATTEMPTS).isLocked()).isTrue()
    }

    @Test
    fun `consumed sets consumedAt and flips isConsumed`() {
        val now = createdAt.plusSeconds(30)
        val consumed = challenge().consumed(now)
        assertThat(consumed.consumedAt).isEqualTo(now)
        assertThat(consumed.isConsumed()).isTrue()
    }
}
