package com.bliss.game.domain

import assertk.assertFailure
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import org.junit.jupiter.api.Test

class PlayerIdTest {
    private val userId = UserId("11111111-1111-4111-8111-111111111111")
    private val sessionId = SessionId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b")

    @Test
    fun `of derives from userId when authenticated`() {
        assertThat(PlayerId.of(userId, sessionId).value).isEqualTo(userId.value)
    }

    @Test
    fun `of falls back to sessionId when anonymous`() {
        assertThat(PlayerId.of(null, sessionId).value).isEqualTo(sessionId.value)
    }

    @Test
    fun `two sessions of one account derive the same PlayerId`() {
        val otherSession = SessionId("0190e3b2-1c45-7d2e-9a3f-c0d1e2f3a4b5")
        assertThat(PlayerId.of(userId, sessionId)).isEqualTo(PlayerId.of(userId, otherSession))
    }

    @Test
    fun `rejects a non-uuid value`() {
        assertFailure { PlayerId("nope") }.isInstanceOf(IllegalArgumentException::class)
    }
}
