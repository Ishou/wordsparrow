package com.bliss.game.domain

import assertk.assertFailure
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import assertk.assertions.messageContains
import com.bliss.game.domain.Fixtures.gameSession
import com.bliss.game.domain.Fixtures.later
import com.bliss.game.domain.Fixtures.now
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

class GameSessionTest {
    private val pPos = Position(0, 3)
    private val aPos = Position(0, 4)
    private val finder = SessionId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b")

    @Test
    fun `isSolved is false when the puzzle has no letter cells`() {
        val noLetterCells =
            GamePuzzle(
                id = UUID.randomUUID(),
                title = "Empty",
                language = "en",
                width = 5,
                height = 5,
                cells = listOf(BlockCell(Position(0, 0))),
                clues = emptyList(),
                createdAt = now,
            )
        val s = GameSession(noLetterCells, emptyMap(), now, null, lockedPositions = emptyMap())
        assertThat(s.isSolved()).isFalse()
    }

    @Test
    fun `isSolved is false when no cells are locked`() {
        assertThat(gameSession().isSolved()).isFalse()
    }

    @Test
    fun `isSolved is false when only some letter cells are locked`() {
        val s = gameSession(lockedPositions = mapOf(pPos to finder))
        assertThat(s.isSolved()).isFalse()
    }

    @Test
    fun `isSolved is true when every letter cell is locked`() {
        val s = gameSession(lockedPositions = mapOf(pPos to finder, aPos to finder))
        assertThat(s.isSolved()).isTrue()
    }

    @Test
    fun `duration returns now minus startedAt while in progress`() {
        val started = now
        val checkpoint = started.plusSeconds(7)
        assertThat(gameSession(startedAt = started).duration(checkpoint))
            .isEqualTo(7.seconds)
    }

    @Test
    fun `duration is frozen at completedAt once solved`() {
        val s = gameSession(startedAt = now, completedAt = later)
        // 184_250 ms between fixtures.now and fixtures.later
        assertThat(s.duration(Instant.parse("2030-01-01T00:00:00Z")))
            .isEqualTo(184_250.milliseconds)
    }

    @Test
    fun `GameSession accepts completedAt equal to startedAt`() {
        val s = gameSession(startedAt = now, completedAt = now)
        assertThat(s.completedAt).isEqualTo(now)
    }

    @Test
    fun `GameSession rejects a completedAt before startedAt`() {
        assertFailure {
            gameSession(startedAt = later, completedAt = now)
        }.messageContains("before startedAt")
    }

    @Test
    fun `lockedPositions defaults to empty`() {
        assertThat(gameSession().lockedPositions).isEqualTo(emptyMap<Position, SessionId>())
    }

    @Test
    fun `lockedPositions roundtrips when set`() {
        val locks = mapOf(pPos to finder, aPos to finder)
        val s =
            GameSession(
                puzzle = gameSession().puzzle,
                entries = emptyMap(),
                lockedPositions = locks,
                startedAt = now,
                completedAt = null,
            )
        assertThat(s.lockedPositions).isEqualTo(locks)
    }
}
