package com.bliss.billing.application.usecases

import java.time.Duration

/** Retry schedule for the outbox drain (ADR-0094 tunables): exponential backoff from 10 min, capped at 6 h, giving up after 12 attempts (~48 h) into a terminal `failed` + alert. */
object EmailRetryPolicy {
    val BASE_DELAY: Duration = Duration.ofMinutes(10)
    val MAX_DELAY: Duration = Duration.ofHours(6)
    const val MAX_ATTEMPTS: Int = 12

    /** Delay before the next retry after [attempts] failures so far (attempts >= 1). */
    fun backoffAfter(attempts: Int): Duration {
        val shift = (attempts - 1).coerceIn(0, 30)
        val scaled = BASE_DELAY.multipliedBy(1L shl shift)
        return if (scaled > MAX_DELAY) MAX_DELAY else scaled
    }

    fun isExhausted(attempts: Int): Boolean = attempts >= MAX_ATTEMPTS
}
