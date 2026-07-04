package com.bliss.billing.domain

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant

class ChatelWindowTest {
    private val window = ChatelWindow.DEFAULT
    private val now = Instant.parse("2026-07-04T12:00:00Z")

    private fun periodEndIn(days: Long): Instant = now.plus(Duration.ofDays(days))

    @Test
    fun `default window spans one to one-and-a-half months before the term`() {
        assertThat(ChatelWindow.DEFAULT.minLead).isEqualTo(Duration.ofDays(30))
        assertThat(ChatelWindow.DEFAULT.maxLead).isEqualTo(Duration.ofDays(45))
    }

    @Test
    fun `sends when the term is inside the window`() {
        assertThat(window.shouldSend(now, periodEndIn(38))).isTrue()
    }

    @Test
    fun `sends at the earliest edge exactly forty-five days before`() {
        assertThat(window.shouldSend(now, periodEndIn(45))).isTrue()
    }

    @Test
    fun `sends at the latest edge exactly thirty days before`() {
        assertThat(window.shouldSend(now, periodEndIn(30))).isTrue()
    }

    @Test
    fun `does not send when the term is still too far off`() {
        assertThat(window.shouldSend(now, periodEndIn(46))).isFalse()
    }

    @Test
    fun `does not send when the one-month deadline has already passed`() {
        assertThat(window.shouldSend(now, periodEndIn(29))).isFalse()
    }

    @Test
    fun `does not send when the term is now`() {
        assertThat(window.shouldSend(now, now)).isFalse()
    }

    @Test
    fun `does not send when the term is already in the past`() {
        assertThat(window.shouldSend(now, periodEndIn(-1))).isFalse()
    }
}
