package com.bliss.identity.domain.auth

import java.security.SecureRandom
import java.util.Base64

// Opaque binding secret tying an OTP start to its verify; mirrors State's CSRF entropy posture.
@JvmInline
value class ChallengeSecret private constructor(
    val value: String,
) {
    companion object {
        private const val BYTE_LENGTH = 32

        fun generate(random: SecureRandom): ChallengeSecret {
            val bytes = ByteArray(BYTE_LENGTH)
            random.nextBytes(bytes)
            return ChallengeSecret(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes))
        }

        fun of(raw: String): ChallengeSecret {
            require(raw.length >= BYTE_LENGTH) { "Challenge secret must be at least $BYTE_LENGTH characters for adequate entropy." }
            return ChallengeSecret(raw)
        }
    }
}
