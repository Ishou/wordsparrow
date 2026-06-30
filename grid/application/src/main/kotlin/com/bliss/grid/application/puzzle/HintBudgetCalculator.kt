package com.bliss.grid.application.puzzle

import java.time.Duration
import java.time.Instant

/** Pure token-bucket math for the regenerating hint budget; caller supplies [now] (no clock, no I/O). */
object HintBudgetCalculator {
    /** [anchor] null means never spent (budget full); otherwise the instant the current regen window started. */
    data class State(
        val tokens: Int,
        val anchor: Instant?,
    )

    data class View(
        val tokensRemaining: Int,
        val secondsUntilNextHint: Long?,
    )

    fun refill(
        state: State,
        now: Instant,
        capacity: Int,
        interval: Duration,
    ): State {
        if (state.tokens >= capacity) return State(capacity, now)
        val anchor = state.anchor ?: return State(capacity, now)
        val elapsed = Duration.between(anchor, now)
        if (elapsed.isNegative || elapsed.isZero) return state
        val regen = (elapsed.seconds / interval.seconds).toInt()
        if (regen <= 0) return state
        val tokens = minOf(capacity, state.tokens + regen)
        return if (tokens >= capacity) {
            State(capacity, now)
        } else {
            State(tokens, anchor.plusSeconds(regen * interval.seconds))
        }
    }

    fun view(
        state: State,
        now: Instant,
        capacity: Int,
        interval: Duration,
    ): View {
        val refilled = refill(state, now, capacity, interval)
        val anchor = refilled.anchor
        if (refilled.tokens >= capacity || anchor == null) return View(refilled.tokens, null)
        val next = anchor.plus(interval)
        val millis = Duration.between(now, next).toMillis()
        // ceil to whole seconds; clamp to one interval so backward clock skew never reports a wait longer than the regen period.
        val seconds = if (millis <= 0) 0L else minOf(interval.seconds, (millis + 999) / 1000)
        return View(refilled.tokens, seconds)
    }

    fun spend(
        state: State,
        now: Instant,
        capacity: Int,
        interval: Duration,
    ): State? {
        val refilled = refill(state, now, capacity, interval)
        if (refilled.tokens <= 0) return null
        return State(refilled.tokens - 1, refilled.anchor ?: now)
    }
}
