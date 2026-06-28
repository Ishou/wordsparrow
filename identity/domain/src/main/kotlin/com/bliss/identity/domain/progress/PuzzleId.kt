package com.bliss.identity.domain.progress

import java.util.UUID

@JvmInline
value class PuzzleId(
    val value: UUID,
) {
    override fun toString(): String = value.toString()

    companion object {
        fun parse(raw: String): PuzzleId = PuzzleId(UUID.fromString(raw))
    }
}
