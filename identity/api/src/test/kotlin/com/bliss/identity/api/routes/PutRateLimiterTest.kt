package com.bliss.identity.api.routes

import assertk.assertThat
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import com.bliss.identity.domain.user.UserId
import org.junit.jupiter.api.Test
import java.util.UUID

class PutRateLimiterTest {
    private val userId = UserId(UUID.randomUUID())
    private val otherId = UserId(UUID.randomUUID())

    @Test
    fun `allows writes up to the per-window max`() {
        var t = 0L
        val limiter = PutRateLimiter(maxPerWindow = 3, windowMs = 60_000L, nowMs = { t })
        assertThat(limiter.allow(userId)).isTrue()
        assertThat(limiter.allow(userId)).isTrue()
        assertThat(limiter.allow(userId)).isTrue()
        assertThat(limiter.allow(userId)).isFalse()
    }

    @Test
    fun `resets counter after window expires`() {
        var t = 0L
        val limiter = PutRateLimiter(maxPerWindow = 1, windowMs = 1_000L, nowMs = { t })
        assertThat(limiter.allow(userId)).isTrue()
        assertThat(limiter.allow(userId)).isFalse()
        t = 1_001L
        assertThat(limiter.allow(userId)).isTrue()
    }

    @Test
    fun `limits are per user — other user is unaffected`() {
        var t = 0L
        val limiter = PutRateLimiter(maxPerWindow = 1, windowMs = 60_000L, nowMs = { t })
        assertThat(limiter.allow(userId)).isTrue()
        assertThat(limiter.allow(userId)).isFalse()
        assertThat(limiter.allow(otherId)).isTrue()
    }
}
