package com.bliss.game.domain

import assertk.assertFailure
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import assertk.assertions.messageContains
import com.bliss.game.domain.Fixtures.lobby
import com.bliss.game.domain.Fixtures.player
import com.bliss.game.domain.Fixtures.sessionA
import com.bliss.game.domain.Fixtures.sessionB
import com.bliss.game.domain.Fixtures.userA
import com.bliss.game.domain.Fixtures.userB
import org.junit.jupiter.api.Test

class LobbyTest {
    @Test
    fun `Lobby in WAITING with no game is valid`() {
        val l = lobby()
        assertThat(l.state).isEqualTo(LobbyLifecycleState.WAITING)
        assertThat(l.game).isEqualTo(null)
    }

    @Test
    fun `Lobby in WAITING rejects a non-null game`() {
        assertFailure {
            lobby(state = LobbyLifecycleState.WAITING, game = Fixtures.gameSession())
        }.messageContains("WAITING")
    }

    @Test
    fun `Lobby in IN_PROGRESS requires a game`() {
        assertFailure {
            lobby(state = LobbyLifecycleState.IN_PROGRESS, game = null)
        }.messageContains("IN_PROGRESS")
    }

    @Test
    fun `Lobby in COMPLETED requires a game`() {
        assertFailure {
            lobby(state = LobbyLifecycleState.COMPLETED, game = null)
        }.messageContains("COMPLETED")
    }

    @Test
    fun `Lobby in COMPLETED requires a completedAt on the game session`() {
        assertFailure {
            lobby(
                state = LobbyLifecycleState.COMPLETED,
                game = Fixtures.gameSession(completedAt = null),
            )
        }.messageContains("completedAt")
    }

    @Test
    fun `Lobby in COMPLETED with completedAt is valid`() {
        val l =
            lobby(
                state = LobbyLifecycleState.COMPLETED,
                game = Fixtures.gameSession(completedAt = Fixtures.later),
            )
        assertThat(l.state).isEqualTo(LobbyLifecycleState.COMPLETED)
    }

    @Test
    fun `Lobby in IN_PROGRESS with a game session is valid`() {
        val l = lobby(state = LobbyLifecycleState.IN_PROGRESS, game = Fixtures.gameSession())
        assertThat(l.state).isEqualTo(LobbyLifecycleState.IN_PROGRESS)
    }

    @Test
    fun `Lobby rejects more than 8 players`() {
        val nine =
            (0 until 9).associate { i ->
                val s = SessionId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a%02x".format(i))
                s to player(s, "P$i")
            }
        // Pass one of the nine as owner — any member works; the cap check fires before owner validation.
        assertFailure {
            lobby(players = nine, ownerSessionId = nine.keys.first())
        }.messageContains("8")
    }

    @Test
    fun `Lobby allows an owner that is not a current member`() {
        // Per ADR-0055, the owner remains the owner after leaving via the
        // regular leave path — they can return via My-games. Owner-only actions
        // are gated on isOwner(sessionId), not on player membership.
        val l =
            lobby(
                players = mapOf(sessionB to player(sessionB, "Bob")),
                ownerSessionId = sessionA,
            )
        assertThat(l.ownerSessionId).isEqualTo(sessionA)
        assertThat(l.hasJoined(PlayerId(sessionA.value))).isFalse()
        assertThat(l.isOwner(sessionA)).isTrue()
    }

    @Test
    fun `isOwner returns true only for the owner sessionId`() {
        val l = lobby()
        assertThat(l.isOwner(sessionA)).isTrue()
        assertThat(l.isOwner(sessionB)).isFalse()
    }

    @Test
    fun `isCurrentOwner is true for an anonymous owner still seated even though ownerUserId is null`() {
        val anon = lobby()
        assertThat(anon.isOwnerless()).isTrue()
        assertThat(anon.isCurrentOwner(sessionA)).isTrue()
    }

    @Test
    fun `isCurrentOwner is false once ownerless and the caller's own seat has been dropped`() {
        // Mirrors what RelinquishOwnershipUseCase composes: relinquishOwner() (nulls ownerUserId)
        // plus dropping the caller's seat -- relinquishOwner() alone leaves players untouched.
        val relinquished = lobby(players = emptyMap()).copy(ownerUserId = null)
        assertThat(relinquished.isOwner(sessionA)).isTrue()
        assertThat(relinquished.isCurrentOwner(sessionA)).isFalse()
        assertThat(relinquished.isCurrentOwner(sessionB)).isFalse()
    }

    @Test
    fun `isCurrentOwner stays true for an absent authenticated owner (plain leave keeps ownerUserId)`() {
        val left = lobby(players = emptyMap()).copy(ownerUserId = userA)
        assertThat(left.isCurrentOwner(sessionA)).isTrue()
    }

    @Test
    fun `isFull is true at 8 players and false below`() {
        val eight =
            (0 until 8).associate { i ->
                val s = SessionId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a%02x".format(i))
                s to player(s, "P$i")
            }
        val full = lobby(players = eight, ownerSessionId = eight.keys.first())
        assertThat(full.isFull()).isTrue()
        assertThat(lobby().isFull()).isFalse()
    }

    @Test
    fun `hasJoined is true for present session and false otherwise`() {
        val l = lobby()
        assertThat(l.hasJoined(PlayerId(sessionA.value))).isTrue()
        assertThat(l.hasJoined(PlayerId(sessionB.value))).isFalse()
    }

    @Test
    fun `touched returns a copy with the new lastActivityAt and otherwise-equal state`() {
        val before = lobby(lastActivityAt = Fixtures.now)
        val after = before.touched(Fixtures.later)
        assertThat(after.lastActivityAt).isEqualTo(Fixtures.later)
        assertThat(after.copy(lastActivityAt = before.lastActivityAt)).isEqualTo(before)
    }

    @Test
    fun `isOwnerless is true when ownerUserId is null and false when set`() {
        assertThat(lobby().copy(ownerUserId = null).isOwnerless()).isTrue()
        assertThat(lobby().copy(ownerUserId = userA).isOwnerless()).isFalse()
    }

    @Test
    fun `isDefunct is true only when ownerless and empty`() {
        assertThat(lobby().copy(ownerUserId = null, players = emptyMap()).isDefunct()).isTrue()
        // Ownerless but still populated -> claimable, not a ghost.
        assertThat(lobby().copy(ownerUserId = null).isDefunct()).isFalse()
        // Owned but empty -> owner returns via My-games, keep it.
        assertThat(lobby().copy(ownerUserId = userA, players = emptyMap()).isDefunct()).isFalse()
    }

    @Test
    fun `relinquishOwner clears ownerUserId and marks the lobby ownerless`() {
        val owned = lobby(lastActivityAt = Fixtures.now).copy(ownerUserId = userA)
        val after = owned.relinquishOwner(Fixtures.later)
        assertThat(after.ownerUserId).isEqualTo(null)
        assertThat(after.isOwnerless()).isTrue()
        assertThat(after.lastActivityAt).isEqualTo(Fixtures.later)
    }

    @Test
    fun `relinquishOwner leaves players ownerSessionId state and game untouched`() {
        val owned =
            lobby(state = LobbyLifecycleState.IN_PROGRESS, game = Fixtures.gameSession())
                .copy(ownerUserId = userA)
        val after = owned.relinquishOwner(Fixtures.later)
        assertThat(after.players).isEqualTo(owned.players)
        assertThat(after.ownerSessionId).isEqualTo(owned.ownerSessionId)
        assertThat(after.state).isEqualTo(LobbyLifecycleState.IN_PROGRESS)
        assertThat(after.game).isEqualTo(owned.game)
    }

    @Test
    fun `relinquishOwner round-trips a WAITING lobby with state unchanged`() {
        val owned = lobby(state = LobbyLifecycleState.WAITING).copy(ownerUserId = userA)
        val after = owned.relinquishOwner(Fixtures.later)
        assertThat(after.state).isEqualTo(LobbyLifecycleState.WAITING)
        assertThat(after.isOwnerless()).isTrue()
    }

    @Test
    fun `claimOwner sets ownerUserId rebinds ownerSessionId and bumps lastActivityAt`() {
        val ownerless =
            lobby(ownerSessionId = sessionA, lastActivityAt = Fixtures.now)
                .copy(ownerUserId = null)
        val after = ownerless.claimOwner(sessionB, userB, Fixtures.later)
        assertThat(after.ownerUserId).isEqualTo(userB)
        assertThat(after.ownerSessionId).isEqualTo(sessionB)
        assertThat(after.isOwner(sessionB)).isTrue()
        assertThat(after.isOwnerless()).isFalse()
        assertThat(after.lastActivityAt).isEqualTo(Fixtures.later)
    }

    @Test
    fun `claimOwner on an IN_PROGRESS lobby keeps state and game unchanged`() {
        val ownerless =
            lobby(state = LobbyLifecycleState.IN_PROGRESS, game = Fixtures.gameSession())
                .copy(ownerUserId = null)
        val after = ownerless.claimOwner(sessionB, userB, Fixtures.later)
        assertThat(after.state).isEqualTo(LobbyLifecycleState.IN_PROGRESS)
        assertThat(after.game).isEqualTo(ownerless.game)
        assertThat(after.players).isEqualTo(ownerless.players)
    }
}
