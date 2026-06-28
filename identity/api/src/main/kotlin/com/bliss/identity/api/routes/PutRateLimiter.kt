package com.bliss.identity.api.routes

import com.bliss.identity.domain.user.UserId
import java.util.concurrent.ConcurrentHashMap

// Sliding-window write rate limiter for PUT /progress; one window per user (ADR-0075).
class PutRateLimiter(
    private val maxPerWindow: Int = 60,
    private val windowMs: Long = 60_000L,
    private val nowMs: () -> Long = System::currentTimeMillis,
) {
    private val windows = ConcurrentHashMap<UserId, Pair<Long, Int>>()

    fun allow(userId: UserId): Boolean {
        val now = nowMs()
        var allowed = true
        windows.compute(userId) { _, current ->
            val (windowStart, count) =
                if (current == null || now - current.first > windowMs) now to 0 else current
            if (count >= maxPerWindow) {
                allowed = false
                windowStart to count
            } else {
                windowStart to (count + 1)
            }
        }
        return allowed
    }
}
