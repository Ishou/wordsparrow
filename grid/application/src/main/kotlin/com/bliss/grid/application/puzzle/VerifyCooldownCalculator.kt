package com.bliss.grid.application.puzzle

import java.time.Duration
import java.time.Instant

/** Pure single-timestamp cooldown gate for grid verification (ADR-0099); caller supplies [now] (no clock, no I/O). */
object VerifyCooldownCalculator {
    const val COOLDOWN_SECONDS: Long = 1800

    data class Result(
        val allowed: Boolean,
        val secondsUntilNextVerify: Long,
    )

    /** [lastVerifiedAt] null means never verified (always allowed, 0 remaining). */
    fun view(
        lastVerifiedAt: Instant?,
        now: Instant,
    ): Result {
        if (lastVerifiedAt == null) return Result(allowed = true, secondsUntilNextVerify = 0)
        val elapsed = Duration.between(lastVerifiedAt, now).seconds
        // Backward clock skew (elapsed < 0) clamps to a full cooldown rather than reporting a negative remainder.
        val remaining = (COOLDOWN_SECONDS - elapsed).coerceIn(0, COOLDOWN_SECONDS)
        return Result(allowed = remaining == 0L, secondsUntilNextVerify = remaining)
    }
}
