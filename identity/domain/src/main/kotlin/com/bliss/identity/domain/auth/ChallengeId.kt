package com.bliss.identity.domain.auth

import java.util.UUID

@JvmInline
value class ChallengeId(
    val value: UUID,
) {
    override fun toString(): String = value.toString()

    companion object {
        fun parse(raw: String): ChallengeId = ChallengeId(UUID.fromString(raw))
    }
}
