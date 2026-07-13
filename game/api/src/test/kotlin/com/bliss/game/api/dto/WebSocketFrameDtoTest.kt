package com.bliss.game.api.dto

import assertk.assertThat
import assertk.assertions.isInstanceOf
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Test

// ADR-0113: the two owner-only command frames are bare `type` discriminators (no body).
class WebSocketFrameDtoTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `rematch frame deserializes to the Rematch variant`() {
        val frame = json.decodeFromString(ClientToServerFrame.serializer(), """{"type":"rematch"}""")
        assertThat(frame).isInstanceOf(ClientToServerFrame.Rematch::class)
    }

    @Test
    fun `returnToSalon frame deserializes to the ReturnToSalon variant`() {
        val frame = json.decodeFromString(ClientToServerFrame.serializer(), """{"type":"returnToSalon"}""")
        assertThat(frame).isInstanceOf(ClientToServerFrame.ReturnToSalon::class)
    }
}
