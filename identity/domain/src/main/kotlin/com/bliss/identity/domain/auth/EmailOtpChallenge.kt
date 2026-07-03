package com.bliss.identity.domain.auth

import com.bliss.identity.domain.user.EmailAddress
import java.time.Instant

// codeHash/bindingHash are opaque SHA-256 hashes produced in infrastructure; the domain never hashes.
data class EmailOtpChallenge(
    val id: ChallengeId,
    val email: EmailAddress,
    val codeHash: String,
    val bindingHash: String,
    val attempts: Int,
    val createdAt: Instant,
    val expiresAt: Instant,
    val consumedAt: Instant?,
) {
    fun isExpired(now: Instant): Boolean = !now.isBefore(expiresAt)

    fun isConsumed(): Boolean = consumedAt != null

    fun isLocked(): Boolean = attempts >= MAX_ATTEMPTS

    fun withIncrementedAttempt(): EmailOtpChallenge = copy(attempts = attempts + 1)

    fun consumed(now: Instant): EmailOtpChallenge = copy(consumedAt = now)

    companion object {
        const val MAX_ATTEMPTS = 5
    }
}
