package com.bliss.game.application.usecases

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNotEqualTo
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import assertk.assertions.matches
import com.bliss.game.application.ports.LobbyEvent
import com.bliss.game.application.usecases.Samples.aPos
import com.bliss.game.application.usecases.Samples.alice
import com.bliss.game.application.usecases.Samples.bob
import com.bliss.game.application.usecases.Samples.pPos
import com.bliss.game.application.usecases.Samples.sessionA
import com.bliss.game.application.usecases.Samples.sessionB
import com.bliss.game.application.usecases.Samples.sessionC
import com.bliss.game.application.usecases.Samples.userA
import com.bliss.game.application.usecases.Samples.userB
import com.bliss.game.domain.GridConfig
import com.bliss.game.domain.Letter
import com.bliss.game.domain.Lobby
import com.bliss.game.domain.LobbyId
import com.bliss.game.domain.LobbyLifecycleState
import com.bliss.game.domain.Player
import com.bliss.game.domain.Position
import com.bliss.game.domain.Pseudonym
import com.bliss.game.domain.SessionId
import com.bliss.game.domain.UserId
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Duration

class LobbyUseCasesTest {
    private fun harness(): Harness = Harness()

    @Test
    fun `CreateLobby places owner in WAITING and emits PlayerJoined`() =
        runTest {
            val h = harness()
            val result = h.create(sessionA, alice)

            assertThat(result.value.state).isEqualTo(LobbyLifecycleState.WAITING)
            assertThat(result.value.ownerSessionId).isEqualTo(sessionA)
            assertThat(result.value.players.keys).isEqualTo(setOf(sessionA))
            assertThat(result.events).hasSize(1)
            assertThat(result.events[0]).isInstanceOf(LobbyEvent.PlayerJoined::class)
        }

    @Test
    fun `CreateLobby starts the lobby at the 28x20 default grid size`() =
        runTest {
            val h = harness()
            val result = h.create(sessionA, alice)

            assertThat(result.value.gridConfig).isEqualTo(GridConfig(28, 20))
        }

    // ADR-0066 amendment 2026-07-05: ownerUserId is stamped at create so it survives the leave-grace.
    @Test
    fun `CreateLobby stamps ownerUserId on the created lobby`() =
        runTest {
            val h = harness()
            val result = h.create(sessionA, alice, userA)

            assertThat(result.value.ownerUserId).isEqualTo(userA)
        }

    @Test
    fun `CreateLobby leaves ownerUserId null for an anonymous owner`() =
        runTest {
            val h = harness()
            val result = h.create(sessionA, alice)

            assertThat(result.value.ownerUserId).isNull()
        }

    // ADR-0083 free-player quota: reopens the owner's existing WAITING lobby instead of minting a second.
    @Test
    fun `CreateLobby reopens the free player's existing WAITING lobby keyed per userId`() =
        runTest {
            val h = harness()
            val first = h.create(sessionA, alice, userA)
            h.clock.advance(Duration.ofSeconds(30))
            val second = h.create(sessionA, alice, userA)

            assertThat(second.value.id).isEqualTo(first.value.id)
            assertThat(second.events).hasSize(0)
        }

    // ADR-0083: the quota is per userId, not per session — a fresh browser session still dedups.
    @Test
    fun `CreateLobby dedups per userId across different sessions`() =
        runTest {
            val h = harness()
            val first = h.create(sessionA, alice, userA)
            val second = h.create(sessionB, alice, userA)

            assertThat(second.value.id).isEqualTo(first.value.id)
            assertThat(second.events).hasSize(0)
        }

    // ADR-0098 §1: the active-game quota counts WAITING OR IN_PROGRESS owned by the user, so
    // starting the game no longer frees the quota — a second create dedups to the in-progress game.
    @Test
    fun `CreateLobby dedups to the owner's IN_PROGRESS game (active-game quota)`() =
        runTest {
            val h = harness()
            val first = h.create(sessionA, alice, userA).value
            h.start(first.id, sessionA).requireSuccess()
            val second = h.create(sessionA, alice, userA)

            assertThat(second.value.id).isEqualTo(first.id)
            assertThat(second.events).hasSize(0)
        }

    // ADR-0083 subscriber quota: `hostUnlimited` skips the dedup, so every create mints a distinct lobby.
    @Test
    fun `CreateLobby with hostUnlimited mints a distinct lobby on every call`() =
        runTest {
            val h = harness()
            val first = h.create(sessionA, alice, userA, hostUnlimited = true)
            val second = h.create(sessionA, alice, userA, hostUnlimited = true)

            assertThat(second.value.id).isNotEqualTo(first.value.id)
            assertThat(second.events).hasSize(1)
        }

    // ADR-0098 §1: hostUnlimited bypasses the active-game quota even when the owner's game is IN_PROGRESS.
    @Test
    fun `CreateLobby with hostUnlimited mints a new lobby past an IN_PROGRESS owned game`() =
        runTest {
            val h = harness()
            val first = h.create(sessionA, alice, userA, hostUnlimited = true).value
            h.start(first.id, sessionA).requireSuccess()
            val second = h.create(sessionA, alice, userA, hostUnlimited = true)

            assertThat(second.value.id).isNotEqualTo(first.id)
            assertThat(second.events).hasSize(1)
        }

    // A lobby owned by a different user is NOT returned by the dedup path.
    @Test
    fun `CreateLobby mints a new lobby for a different user even if other lobbies exist`() =
        runTest {
            val h = harness()
            val a = h.create(sessionA, alice, userA).value
            val b = h.create(sessionB, bob, userB)

            assertThat(b.value.id).isNotEqualTo(a.id)
            assertThat(b.value.ownerSessionId).isEqualTo(sessionB)
        }

    @Test
    fun `JoinLobby adds a new player and emits PlayerJoined`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value

            val out = h.join(lobby.id, sessionB, bob).requireSuccess()

            assertThat(out.value.players.keys).isEqualTo(setOf(sessionA, sessionB))
            assertThat(out.events).hasSize(1)
        }

    @Test
    fun `JoinLobby is idempotent for the same sessionId reconnect`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            val first = h.join(lobby.id, sessionB, bob).requireSuccess()
            h.clock.advance(Duration.ofSeconds(15))
            val second = h.join(lobby.id, sessionB, bob).requireSuccess()

            assertThat(second.value.players[sessionB]).isEqualTo(first.value.players[sessionB])
            assertThat(second.events).hasSize(0)
        }

    @Test
    fun `JoinLobby returns LobbyFull at capacity`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            // fill to 8
            repeat(7) { i ->
                h.join(lobby.id, validSession(i), Pseudonym("P$i")).requireSuccess()
            }
            val ninth = h.join(lobby.id, validSession(7), Pseudonym("Late"))
            assertThat((ninth as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.LobbyFull)
        }

    @Test
    fun `JoinLobby returns LobbyNotFound when missing`() =
        runTest {
            val h = harness()
            val ghost = LobbyId("zzzzzzzz")
            // The not-found branch fires before any code check, so an
            // arbitrary code is fine here.
            val out = h.joinWithCode(ghost, sessionA, alice, code = "A2B3C4")
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.LobbyNotFound)
        }

    // ADR-0027 — code-gate cases. New joiners must present the lobby's
    // `code`; reconnecting sessions (sessionId already a member) bypass the
    // check by construction so a refresh / tab-recovery flow never needs
    // the code.

    @Test
    fun `JoinLobby returns WrongCode when a new joiner presents a null code`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            val out = h.joinWithCode(lobby.id, sessionB, bob, code = null)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.WrongCode)
        }

    @Test
    fun `JoinLobby returns WrongCode when a new joiner presents a mismatched code`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            // Pattern-valid but not this lobby's code.
            val out = h.joinWithCode(lobby.id, sessionB, bob, code = "WRONG2")
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.WrongCode)
        }

    @Test
    fun `JoinLobby admits a new joiner when the code matches lobby code`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            val out = h.joinWithCode(lobby.id, sessionB, bob, code = lobby.code.value).requireSuccess()
            assertThat(out.value.players.keys).isEqualTo(setOf(sessionA, sessionB))
        }

    // Reconnect bypass — the existing reconnect test (`JoinLobby is idempotent
    // for the same sessionId reconnect`) already exercises the happy path
    // because the convenience `join` resolves the lobby's code. The two
    // cases below pin the ADR-0027 invariant that reconnects do NOT consult
    // the code, regardless of what the client re-sends.

    @Test
    fun `JoinLobby reconnect succeeds even when code is null`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            h.joinWithCode(lobby.id, sessionB, bob, code = lobby.code.value).requireSuccess()
            h.clock.advance(Duration.ofSeconds(15))
            // Reconnect with null code — must still succeed (idempotent path).
            val second = h.joinWithCode(lobby.id, sessionB, bob, code = null).requireSuccess()
            assertThat(second.value.players[sessionB]).isNotNull()
            assertThat(second.events).hasSize(0)
        }

    @Test
    fun `JoinLobby reconnect succeeds even when code is wrong (regression guard)`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            h.joinWithCode(lobby.id, sessionB, bob, code = lobby.code.value).requireSuccess()
            // A client that re-sends a stale / mistyped code on reconnect must
            // not be locked out of their own lobby — guards against a future
            // refactor that mistakenly applies the code check before the
            // reconnect branch.
            val out = h.joinWithCode(lobby.id, sessionB, bob, code = "WRONG2").requireSuccess()
            assertThat(out.value.players[sessionB]).isNotNull()
            assertThat(out.events).hasSize(0)
        }

    @Test
    fun `JoinLobby owner who left re-enters without code and is re-added as player`() =
        runTest {
            val h = harness()
            // Authed owner: leaving keeps the (owned) lobby alive so the owner can re-enter; an anonymous solo owner would destroy it.
            val lobby = h.create(sessionA, alice, userA).value
            h.start(lobby.id, sessionA).requireSuccess()
            h.leave(lobby.id, sessionA).requireSuccess()
            // Owner is now absent from players but still the owner.
            val out = h.joinWithCode(lobby.id, sessionA, alice, code = null).requireSuccess()
            assertThat(out.value.ownerSessionId).isEqualTo(sessionA)
            assertThat(out.value.players[sessionA]).isNotNull()
            assertThat(out.events).hasSize(1)
            assertThat(out.events[0]).isInstanceOf(LobbyEvent.PlayerJoined::class)
        }

    @Test
    fun `JoinLobby owner who left re-enters even when code is wrong`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            h.start(lobby.id, sessionA).requireSuccess()
            h.leave(lobby.id, sessionA).requireSuccess()
            val out = h.joinWithCode(lobby.id, sessionA, alice, code = "WRONG2").requireSuccess()
            assertThat(out.value.players[sessionA]).isNotNull()
        }

    @Test
    fun `JoinLobby outsider with wrong code is still rejected (owner bypass does not widen auth)`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            val out = h.joinWithCode(lobby.id, sessionC, Pseudonym("Carol"), code = "WRONG2")
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.WrongCode)
        }

    @Test
    fun `JoinLobby owner who left cannot rejoin a full lobby and gets LobbyFull`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            h.leave(lobby.id, sessionA).requireSuccess()
            // Fill all 8 slots with non-owner sessions.
            repeat(8) { i ->
                h.join(lobby.id, validSession(i), Pseudonym("P$i")).requireSuccess()
            }
            val out = h.joinWithCode(lobby.id, sessionA, alice, code = null)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.LobbyFull)
        }

    // ADR-0066 (b): a server-verified userId bypasses the code for the owner/member; anon stays code-gated.
    @Test
    fun `JoinLobby authed owner rejoins cross-device without code, ownership follows the new session`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userId = userA).value
            // Owner's original seat is gone (leave-grace), but ownerUserId survives.
            h.leave(lobby.id, sessionA).requireSuccess()
            val newDevice = validSession(20)

            val out = h.joinWithUserId(lobby.id, newDevice, alice, code = null, userId = userA).requireSuccess()

            assertThat(out.value.ownerSessionId).isEqualTo(newDevice)
            assertThat(out.value.players[newDevice]?.userId).isEqualTo(userA)
            assertThat(out.events).hasSize(1)
            assertThat(out.events[0]).isInstanceOf(LobbyEvent.PlayerJoined::class)
            // The rebind makes the new device the owner, so owner-gated actions work verbatim.
            h.rotate(lobby.id, newDevice).requireSuccess()
        }

    @Test
    fun `JoinLobby authed member rejoins cross-device by userId without code, ownership unchanged`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userId = userA).value
            // A seat carries userB under an old session (e.g. a prior seat-rebind).
            val oldMemberSession = validSession(30)
            h.repo.save(
                lobby.copy(
                    players = lobby.players + (oldMemberSession to Player(oldMemberSession, bob, h.clock.now(), userId = userB)),
                ),
            )
            val newDevice = validSession(31)

            val out = h.joinWithUserId(lobby.id, newDevice, bob, code = null, userId = userB).requireSuccess()

            assertThat(out.value.players[newDevice]?.userId).isEqualTo(userB)
            assertThat(out.value.players[oldMemberSession]).isNull()
            assertThat(out.value.players).hasSize(2)
            assertThat(out.value.ownerSessionId).isEqualTo(sessionA)
            assertThat(out.events).hasSize(1)
        }

    // ADR-0066 (b): rejoining your OWN stale seat on a full lobby is a net-zero swap, so it must be admitted, not rejected as LobbyFull.
    @Test
    fun `JoinLobby authed member rejoins a full lobby by replacing their own stale seat`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userId = userA).value
            val oldMemberSession = validSession(30)
            // Fill to MAX_PLAYERS: owner + 6 anon + the caller's own stale userB seat under an old session.
            val anon = (1..6).associate { i -> validSession(i) to Player(validSession(i), Pseudonym("P$i"), h.clock.now()) }
            h.repo.save(
                lobby.copy(
                    players =
                        lobby.players + anon +
                            (oldMemberSession to Player(oldMemberSession, bob, h.clock.now(), userId = userB)),
                ),
            )
            val newDevice = validSession(31)

            val out = h.joinWithUserId(lobby.id, newDevice, bob, code = null, userId = userB).requireSuccess()

            assertThat(out.value.players).hasSize(Lobby.MAX_PLAYERS)
            assertThat(out.value.players[oldMemberSession]).isNull()
            assertThat(out.value.players[newDevice]?.userId).isEqualTo(userB)
            assertThat(out.value.ownerSessionId).isEqualTo(sessionA)
            assertThat(out.events).hasSize(1)
        }

    @Test
    fun `JoinLobby anon caller with wrong code is still WrongCode (userId null regression guard)`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userId = userA).value
            val out = h.joinWithUserId(lobby.id, sessionB, bob, code = "WRONG2", userId = null)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.WrongCode)
        }

    @Test
    fun `JoinLobby authed caller matching neither owner nor any seat stays code-gated`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userId = userA).value
            // userB owns no seat here and is not the owner, so no arm bypasses the code.
            val out = h.joinWithUserId(lobby.id, validSession(40), Pseudonym("Mallory"), code = null, userId = userB)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.WrongCode)
        }

    // ADR-0029 — owner-only rotation. Tests verify the owner gate, the
    // in-place code update, and that the OLD code stops working.

    @Test
    fun `RotateLobbyCode mints a fresh code and emits CodeRotated`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            val before = lobby.code.value
            val out = h.rotate(lobby.id, sessionA).requireSuccess()
            assertThat(out.value.code.value).isNotEqualTo(before)
            assertThat(out.value.code.value).matches(Regex("^[A-HJKM-NP-Z2-9]{6}$"))
            assertThat(out.events).containsExactly(LobbyEvent.CodeRotated(out.value.code))
        }

    @Test
    fun `RotateLobbyCode rejects non-owner with NotOwner and leaves code untouched`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            h.join(lobby.id, sessionB, bob).requireSuccess()
            val before =
                h.repo
                    .findById(lobby.id)!!
                    .code.value
            val out = h.rotate(lobby.id, sessionB)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.NotOwner)
            assertThat(
                h.repo
                    .findById(lobby.id)!!
                    .code.value,
            ).isEqualTo(before)
        }

    // ADR-0098 §2: owner-gated actions go inert once ownerless; relinquish leaves ownerSessionId
    // pointed at the ex-owner, so isOwner alone is not enough to re-authorize.
    @Test
    fun `RotateLobbyCode returns NotOwner after the owner relinquishes`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            // A co-player keeps the lobby alive as ownerless; a solo relinquish would destroy it (ADR-0055/0098).
            h.join(lobby.id, sessionB, bob).requireSuccess()
            h.relinquish(lobby.id, sessionA).requireSuccess()

            val out = h.rotate(lobby.id, sessionA)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.NotOwner)
        }

    @Test
    fun `RotateLobbyCode returns LobbyNotFound when missing`() =
        runTest {
            val h = harness()
            val ghost = LobbyId("zzzzzzzz")
            val out = h.rotate(ghost, sessionA)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.LobbyNotFound)
        }

    @Test
    fun `RotateLobbyCode keeps existing players (reconnect-bypass invariant unchanged)`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            h.join(lobby.id, sessionB, bob).requireSuccess()
            h.rotate(lobby.id, sessionA).requireSuccess()
            val state = h.repo.findById(lobby.id)!!
            assertThat(state.players.keys).isEqualTo(setOf(sessionA, sessionB))
            // sessionB is already a member; reconnect bypasses the code check.
            val reconnect = h.joinWithCode(lobby.id, sessionB, bob, code = null).requireSuccess()
            assertThat(reconnect.value.players[sessionB]).isNotNull()
            assertThat(reconnect.events).hasSize(0)
        }

    @Test
    fun `JoinLobby with the old code fails after rotation`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            val oldCode = lobby.code.value
            h.rotate(lobby.id, sessionA).requireSuccess()
            val rejected = h.joinWithCode(lobby.id, sessionB, bob, code = oldCode)
            assertThat((rejected as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.WrongCode)
            // The post-rotation code DOES admit a fresh joiner.
            val newCode =
                h.repo
                    .findById(lobby.id)!!
                    .code.value
            val admitted = h.joinWithCode(lobby.id, sessionB, bob, code = newCode).requireSuccess()
            assertThat(admitted.value.players.keys).isEqualTo(setOf(sessionA, sessionB))
        }

    @Test
    fun `RenameSelf updates pseudonym and emits PlayerRenamed`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            val out = h.rename(lobby.id, sessionA, Pseudonym("Alicia")).requireSuccess()
            assertThat(out.value.players[sessionA]?.pseudonym).isEqualTo(Pseudonym("Alicia"))
            assertThat(out.events).containsExactly(LobbyEvent.PlayerRenamed(sessionA, Pseudonym("Alicia")))
        }

    @Test
    fun `RenameSelf rejects unknown sessionId with PlayerNotInLobby`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            val out = h.rename(lobby.id, sessionB, Pseudonym("Mallory"))
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.PlayerNotInLobby)
        }

    @Test
    fun `SetGridConfig is owner-only`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            h.join(lobby.id, sessionB, bob).requireSuccess()

            val notOwner = h.setConfig(lobby.id, sessionB, GridConfig(9, 9))
            assertThat((notOwner as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.NotOwner)

            val ok = h.setConfig(lobby.id, sessionA, GridConfig(9, 9)).requireSuccess()
            assertThat(ok.value.gridConfig).isEqualTo(GridConfig(9, 9))
            assertThat(ok.events).containsExactly(LobbyEvent.GridConfigChanged(GridConfig(9, 9)))
        }

    @Test
    fun `SetGridConfig returns NotOwner after the owner relinquishes`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            // A co-player keeps the lobby alive as ownerless; a solo relinquish would destroy it (ADR-0055/0098).
            h.join(lobby.id, sessionB, bob).requireSuccess()
            h.relinquish(lobby.id, sessionA).requireSuccess()

            val out = h.setConfig(lobby.id, sessionA, GridConfig(9, 9))
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.NotOwner)
        }

    @Test
    fun `StartGame fetches puzzle, transitions to IN_PROGRESS, emits GameStarted`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            val started = h.start(lobby.id, sessionA).requireSuccess()

            assertThat(started.value.state).isEqualTo(LobbyLifecycleState.IN_PROGRESS)
            assertThat(started.value.game).isNotNull()
            assertThat(started.events).hasSize(1)
            assertThat(started.events[0]).isInstanceOf(LobbyEvent.GameStarted::class)
        }

    @Test
    fun `StartGame rejects non-owner and refuses outside WAITING`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            h.join(lobby.id, sessionB, bob).requireSuccess()
            val notOwner = h.start(lobby.id, sessionB)
            assertThat((notOwner as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.NotOwner)

            h.start(lobby.id, sessionA).requireSuccess()
            val twice = h.start(lobby.id, sessionA)
            assertThat((twice as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.InvalidState)
        }

    @Test
    fun `StartGame returns NotOwner after the owner relinquishes`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            // A co-player keeps the lobby alive as ownerless; a solo relinquish would destroy it (ADR-0055/0098).
            h.join(lobby.id, sessionB, bob).requireSuccess()
            h.relinquish(lobby.id, sessionA).requireSuccess()

            val out = h.start(lobby.id, sessionA)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.NotOwner)
        }

    @Test
    fun `UpdateCell records entry and is rejected outside IN_PROGRESS`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            // outside IN_PROGRESS
            val rejected = h.write(lobby.id, sessionA, pPos, Letter('P'))
            assertThat((rejected as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.InvalidState)

            h.start(lobby.id, sessionA).requireSuccess()
            h.clock.advance(Duration.ofSeconds(3))
            val written = h.write(lobby.id, sessionA, pPos, Letter('P')).requireSuccess()
            assertThat(
                written.value.game
                    ?.entries
                    ?.get(pPos)
                    ?.letter,
            ).isEqualTo(Letter('P'))
            assertThat(written.events).hasSize(1)
            assertThat(written.events[0]).isInstanceOf(LobbyEvent.CellUpdated::class)
        }

    @Test
    fun `UpdateCell with null letter clears the entry`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            h.start(lobby.id, sessionA).requireSuccess()
            h.write(lobby.id, sessionA, pPos, Letter('Z')).requireSuccess()
            val cleared = h.write(lobby.id, sessionA, pPos, null).requireSuccess()
            assertThat(
                cleared.value.game
                    ?.entries
                    ?.get(pPos),
            ).isNull()
        }

    @Test
    fun `UpdateCell on the final correct letter emits CellUpdated then GameSolved and moves to COMPLETED`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            h.start(lobby.id, sessionA).requireSuccess()
            h.clock.advance(Duration.ofSeconds(2))
            h.write(lobby.id, sessionA, pPos, Letter('P')).requireSuccess()
            h.clock.advance(Duration.ofSeconds(3))
            val solved = h.write(lobby.id, sessionA, aPos, Letter('A')).requireSuccess()

            assertThat(solved.value.state).isEqualTo(LobbyLifecycleState.COMPLETED)
            assertThat(solved.value.game?.completedAt).isNotNull()
            assertThat(solved.events).hasSize(2)
            assertThat(solved.events[0]).isInstanceOf(LobbyEvent.CellUpdated::class)
            assertThat(solved.events[1]).isInstanceOf(LobbyEvent.GameSolved::class)
            val gs = solved.events[1] as LobbyEvent.GameSolved
            // started at t=0, P written at t=2s, A written at t=5s -> 5000 ms
            assertThat(gs.durationMs).isEqualTo(5000L)
        }

    @Test
    fun `LeaveLobby removes a non-owner and keeps owner stable`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            h.join(lobby.id, sessionB, bob).requireSuccess()
            val out = h.leave(lobby.id, sessionB).requireSuccess()
            val state = out.value ?: error("expected lobby to remain")
            assertThat(state.players.keys).isEqualTo(setOf(sessionA))
            assertThat(state.ownerSessionId).isEqualTo(sessionA)
            assertThat(out.events).containsExactly(LobbyEvent.PlayerLeft(sessionB))
        }

    @Test
    fun `LeaveLobby keeps ownerSessionId unchanged when owner leaves`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            h.clock.advance(Duration.ofSeconds(1))
            h.join(lobby.id, sessionB, bob).requireSuccess()
            h.clock.advance(Duration.ofSeconds(1))
            h.join(lobby.id, sessionC, Pseudonym("Carol")).requireSuccess()

            val out = h.leave(lobby.id, sessionA).requireSuccess()
            val state = out.value ?: error("expected lobby to remain")
            // Owner is expected to return via My-games (ADR-0039); ownership stays put.
            assertThat(state.ownerSessionId).isEqualTo(sessionA)
            assertThat(state.players.keys).isEqualTo(setOf(sessionB, sessionC))
            assertThat(out.events).containsExactly(LobbyEvent.PlayerLeft(sessionA))
        }

    // ADR-0055/0098: an anonymous owner is ownerless (ownerUserId null); the last player leaving destroys the ghost.
    @Test
    fun `LeaveLobby destroys an ownerless lobby when its last player leaves`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            val out = h.leave(lobby.id, sessionA).requireSuccess()
            assertThat(out.value).isNull()
            assertThat(out.events).containsExactly(LobbyEvent.PlayerLeft(sessionA))
            assertThat(h.repo.findById(lobby.id)).isNull()
        }

    // ADR-0055/0098: after the owner relinquishes, the remaining co-player leaving empties the ownerless lobby -> destroyed.
    @Test
    fun `LeaveLobby destroys a relinquished lobby when the last co-player leaves`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            h.join(lobby.id, sessionB, bob).requireSuccess()
            h.relinquish(lobby.id, sessionA).requireSuccess()

            val out = h.leave(lobby.id, sessionB).requireSuccess()

            assertThat(out.value).isNull()
            assertThat(h.repo.findById(lobby.id)).isNull()
        }

    // ADR-0055/0098 MUST-NOT: an owned lobby emptied by the owner disconnecting stays (owner_user_id is sticky).
    @Test
    fun `LeaveLobby keeps an owned lobby when the owner leaves it empty`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            val out = h.leave(lobby.id, sessionA).requireSuccess()

            assertThat(out.value!!.players.keys).isEqualTo(emptySet())
            assertThat(out.value!!.ownerUserId).isEqualTo(userA)
            assertThat(h.repo.findById(lobby.id)).isNotNull()
        }

    @Test
    fun `LeaveLobby leaves owner-only actions unavailable after the owner leaves`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            h.join(lobby.id, sessionB, bob).requireSuccess()
            h.leave(lobby.id, sessionA).requireSuccess()
            // Lobby persists with ownerSessionId still pointing at sessionA, who is no
            // longer a player. A non-owner trying to start the game is rejected as NotOwner.
            val out = h.start(lobby.id, sessionB)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.NotOwner)
        }

    @Test
    fun `SetGridConfig returns InvalidState when lobby is IN_PROGRESS`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            h.start(lobby.id, sessionA).requireSuccess()
            val out = h.setConfig(lobby.id, sessionA, GridConfig(9, 9))
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.InvalidState)
        }

    @Test
    fun `LeaveLobby returns PlayerNotInLobby when player never joined`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            val out = h.leave(lobby.id, sessionB)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.PlayerNotInLobby)
        }

    @Test
    fun `UpdateCell returns PlayerNotInLobby when caller is not in lobby`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice).value
            h.start(lobby.id, sessionA).requireSuccess()
            val out = h.write(lobby.id, sessionB, pPos, Letter('P'))
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.PlayerNotInLobby)
        }

    // ADR-0098 "disconnect/leave keeps ownership; only explicit relinquish clears it": a plain
    // leave by the owner must NOT null ownerUserId (ADR-0066 Mes-parties visibility depends on it).
    @Test
    fun `LeaveLobby keeps ownerUserId unchanged when the owner leaves`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            h.leave(lobby.id, sessionA).requireSuccess()

            val after = h.repo.findById(lobby.id)
            assertThat(after).isNotNull()
            assertThat(after!!.ownerUserId).isEqualTo(userA)
        }

    // ADR-0098 §2: the current owner relinquishes to ownerless and drops their own seat; a co-player keeps it alive.
    @Test
    fun `Relinquish clears ownerUserId, drops the owner seat, and emits PlayerLeft`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            h.join(lobby.id, sessionB, bob).requireSuccess()
            val out = h.relinquish(lobby.id, sessionA).requireSuccess()

            val relinquished = out.value!!
            assertThat(relinquished.ownerUserId).isNull()
            assertThat(relinquished.players.keys.contains(sessionA)).isEqualTo(false)
            assertThat(relinquished.players.keys.contains(sessionB)).isEqualTo(true)
            assertThat(out.events).containsExactly(LobbyEvent.PlayerLeft(sessionA))
        }

    // ADR-0055/0098: a sole owner relinquishing empties an ownerless lobby -> it is destroyed, not just ownerless.
    @Test
    fun `Relinquish destroys the lobby when the owner is the sole player`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            val out = h.relinquish(lobby.id, sessionA).requireSuccess()

            assertThat(out.events).containsExactly(LobbyEvent.PlayerLeft(sessionA))
            assertThat(h.repo.findById(lobby.id)).isNull()
        }

    @Test
    fun `Relinquish returns NotOwner when caller is not the owner`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            h.joinWithUserId(lobby.id, sessionB, bob, lobby.code.value, userB).requireSuccess()
            val out = h.relinquish(lobby.id, sessionB)

            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.NotOwner)
        }

    // ADR-0098 §2: relinquishOwner() nulls ownerUserId but not ownerSessionId, so isOwner alone
    // stays true for the ex-owner's session; the second relinquish must still be rejected.
    @Test
    fun `Relinquish returns NotOwner when called a second time by the same session`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            // A co-player keeps the lobby alive after the first relinquish; a solo relinquish would destroy it.
            h.join(lobby.id, sessionB, bob).requireSuccess()
            h.relinquish(lobby.id, sessionA).requireSuccess()

            val out = h.relinquish(lobby.id, sessionA)

            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.NotOwner)
        }

    @Test
    fun `Relinquish returns LobbyNotFound for an unknown lobby`() =
        runTest {
            val h = harness()
            val out = h.relinquish(LobbyId.generate(), sessionA)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.LobbyNotFound)
        }

    // ADR-0098 §2 (2026-07-08 amendment): the REST path authorizes by owner_user_id, not the live owner seat.
    @Test
    fun `RelinquishByUser clears ownerUserId and drops the former owner seat`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            // A co-player keeps the lobby alive as ownerless; a solo relinquish would destroy it (ADR-0055/0098).
            h.join(lobby.id, sessionB, bob).requireSuccess()
            val out = h.relinquishByUser(lobby.id, userA).requireSuccess()

            assertThat(out.value.ownerUserId).isNull()
            assertThat(
                out.value.players.keys
                    .contains(sessionA),
            ).isEqualTo(false)
            assertThat(
                out.value.players.keys
                    .contains(sessionB),
            ).isEqualTo(true)
            assertThat(h.repo.findById(lobby.id)).isNotNull()
        }

    // ADR-0055/0098: the REST relinquish of a solo game destroys the lobby (findById -> null), not just ownerless.
    @Test
    fun `RelinquishByUser destroys the lobby when the owner is the sole player`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            val out = h.relinquishByUser(lobby.id, userA).requireSuccess()

            assertThat(out.value.isOwnerless()).isEqualTo(true)
            assertThat(h.repo.findById(lobby.id)).isNull()
        }

    @Test
    fun `RelinquishByUser returns NotOwner when the userId does not own the lobby`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            val out = h.relinquishByUser(lobby.id, userB)

            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.NotOwner)
        }

    // Idempotent-reject: an already-ownerless lobby has a null owner_user_id, so the userId check fails.
    @Test
    fun `RelinquishByUser returns NotOwner on an already-ownerless lobby`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            // A co-player keeps the lobby alive after the first relinquish; a solo relinquish would destroy it.
            h.join(lobby.id, sessionB, bob).requireSuccess()
            h.relinquishByUser(lobby.id, userA).requireSuccess()

            val out = h.relinquishByUser(lobby.id, userA)

            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.NotOwner)
        }

    @Test
    fun `RelinquishByUser returns LobbyNotFound for an unknown lobby`() =
        runTest {
            val h = harness()
            val out = h.relinquishByUser(LobbyId.generate(), userA)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.LobbyNotFound)
        }

    // ---- LeaveMembership (ADR-0098 amendment 2026-07-08): leave + relinquish-if-owner + destroy-if-defunct) ----

    // Owner alone -> relinquish nulls owner + drops the only seat -> ownerless-and-empty -> destroyed.
    @Test
    fun `LeaveMembership by the sole owner destroys the lobby`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            val out = h.leaveMembership(lobby.id, userA).requireSuccess()

            assertThat(out.value.relinquishedOwnership).isEqualTo(true)
            assertThat(h.repo.findById(lobby.id)).isNull()
        }

    // Owner with a co-player -> ownership relinquished, lobby survives host-less, co-player kept.
    @Test
    fun `LeaveMembership by an owner with a co-player leaves it ownerless keeping the co-player`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            h.join(lobby.id, sessionB, bob).requireSuccess()

            val out = h.leaveMembership(lobby.id, userA).requireSuccess()

            assertThat(out.value.relinquishedOwnership).isEqualTo(true)
            val state = h.repo.findById(lobby.id)!!
            assertThat(state.ownerUserId).isNull()
            assertThat(state.players.keys.contains(sessionA)).isEqualTo(false)
            assertThat(state.players.keys.contains(sessionB)).isEqualTo(true)
        }

    // Non-owner among others -> only their seat is dropped; the lobby stays owned.
    @Test
    fun `LeaveMembership by a non-owner co-player drops only their seat and keeps the lobby owned`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            h.joinWithUserId(lobby.id, sessionB, bob, lobby.code.value, userB).requireSuccess()
            // A signed-in co-player's seat carries their userId only after the ADR-0066 rebind.
            h.rebind(sessionB, userB, bob)

            val out = h.leaveMembership(lobby.id, userB).requireSuccess()

            assertThat(out.value.relinquishedOwnership).isEqualTo(false)
            val state = h.repo.findById(lobby.id)!!
            assertThat(state.ownerUserId).isEqualTo(userA)
            assertThat(state.players.keys.contains(sessionB)).isEqualTo(false)
            assertThat(state.players.keys.contains(sessionA)).isEqualTo(true)
        }

    // A guest seat carries no userId; it is resolved by the session-derived id (ADR-0078). Alone + host-less -> destroyed.
    @Test
    fun `LeaveMembership by a guest resolves the seat by session-derived id and destroys a solo host-less lobby`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userId = null).value

            val out = h.leaveMembership(lobby.id, UserId(sessionA.value)).requireSuccess()

            assertThat(out.value.relinquishedOwnership).isEqualTo(false)
            assertThat(h.repo.findById(lobby.id)).isNull()
        }

    @Test
    fun `LeaveMembership returns NotPresentInLobby when the caller has no seat`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            val out = h.leaveMembership(lobby.id, userB)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.NotPresentInLobby)
        }

    @Test
    fun `LeaveMembership returns LobbyNotFound for an unknown lobby`() =
        runTest {
            val h = harness()
            val out = h.leaveMembership(LobbyId.generate(), userA)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.LobbyNotFound)
        }

    // ADR-0098 §2: a present player claims an ownerless game, rebinding owner_user_id and ownerSessionId.
    @Test
    fun `Claim rebinds ownership to a present player on an ownerless lobby`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            h.joinWithUserId(lobby.id, sessionB, bob, lobby.code.value, userB).requireSuccess()
            h.relinquish(lobby.id, sessionA).requireSuccess()

            val claimed = h.claim(lobby.id, sessionB, userB).requireSuccess()

            assertThat(claimed.value.ownerUserId).isEqualTo(userB)
            assertThat(claimed.value.ownerSessionId).isEqualTo(sessionB)
        }

    @Test
    fun `Claim returns NotPresentInLobby when the caller is not in the lobby`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            h.joinWithUserId(lobby.id, sessionB, bob, lobby.code.value, userB).requireSuccess()
            h.relinquish(lobby.id, sessionA).requireSuccess()

            val out = h.claim(lobby.id, sessionC, userA)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.NotPresentInLobby)
        }

    @Test
    fun `Claim returns AlreadyOwned when the lobby still has an owner`() =
        runTest {
            val h = harness()
            val lobby = h.create(sessionA, alice, userA).value
            h.joinWithUserId(lobby.id, sessionB, bob, lobby.code.value, userB).requireSuccess()

            val out = h.claim(lobby.id, sessionB, userB)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.AlreadyOwned)
        }

    // ADR-0098 §1/§5: claiming is quota-gated — a claimer already at their active-game limit is rejected.
    @Test
    fun `Claim returns QuotaExceeded when the claimer already owns an active game`() =
        runTest {
            val h = harness()
            val abandoned = h.create(sessionA, alice, userA).value
            h.joinWithUserId(abandoned.id, sessionB, bob, abandoned.code.value, userB).requireSuccess()
            h.relinquish(abandoned.id, sessionA).requireSuccess()
            h.create(sessionC, bob, userB)

            val out = h.claim(abandoned.id, sessionB, userB)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.QuotaExceeded)
        }

    @Test
    fun `Claim with hostUnlimited bypasses the active-game quota`() =
        runTest {
            val h = harness()
            val abandoned = h.create(sessionA, alice, userA).value
            h.joinWithUserId(abandoned.id, sessionB, bob, abandoned.code.value, userB).requireSuccess()
            h.relinquish(abandoned.id, sessionA).requireSuccess()
            h.create(sessionC, bob, userB)

            val claimed = h.claim(abandoned.id, sessionB, userB, hostUnlimited = true).requireSuccess()
            assertThat(claimed.value.ownerUserId).isEqualTo(userB)
        }

    @Test
    fun `Claim returns LobbyNotFound for an unknown lobby`() =
        runTest {
            val h = harness()
            val out = h.claim(LobbyId.generate(), sessionA, userA)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.LobbyNotFound)
        }
}

/** Generates a UUIDv7 with deterministic-enough hex for max-capacity tests. */
private fun validSession(i: Int): SessionId {
    val low = "%04x".format(0xb000 + i)
    return SessionId("0190e3b2-1c45-7d2e-9a3f-c0d1e2f3$low")
}

internal class Harness(
    puzzle: com.bliss.game.domain.GamePuzzle = Samples.puzzle(),
    answers: Map<com.bliss.game.domain.Position, com.bliss.game.domain.Letter> =
        run {
            // Default answers: extract from the puzzle's LetterCells. Existing
            // tests that hand-construct puzzles with answers on letter cells
            // (the pre-validator era of game/domain) keep working without
            // every test having to plumb a separate answer table.
            val map = mutableMapOf<com.bliss.game.domain.Position, com.bliss.game.domain.Letter>()
            for (cell in puzzle.cells) {
                if (cell is com.bliss.game.domain.LetterCell) cell.answer?.let { map[cell.position] = it }
            }
            map
        },
    failingPositions: Set<com.bliss.game.domain.Position> = emptySet(),
) {
    val clock = FakeClock()
    val repo = InMemoryLobbyRepository()
    val provider = FakePuzzleProvider(puzzle)
    val wordValidator = FakeWordValidator(answers, failingPositions)
    val create = CreateLobbyUseCase(repo, clock)
    val join = JoinLobbyUseCase(repo, clock)
    val rename = RenameSelfUseCase(repo, clock)
    val setConfig = SetGridConfigUseCase(repo, clock)
    val start = StartGameUseCase(repo, provider, clock)
    val update = UpdateCellUseCase(repo, clock, wordValidator)
    val leave = LeaveLobbyUseCase(repo, clock)
    val rotateCode = RotateLobbyCodeUseCase(repo, clock)
    val claim = ClaimLobbyOwnershipUseCase(repo, clock)
    val relinquish = RelinquishOwnershipUseCase(repo, clock)
    val relinquishByUser = RelinquishOwnershipByUserUseCase(repo, clock)
    val leaveMembership = LeaveMembershipUseCase(repo, leave, relinquishByUser)

    suspend fun create(
        s: SessionId,
        p: Pseudonym,
        userId: UserId? = null,
        hostUnlimited: Boolean = false,
    ) = create.invoke(s, p, userId, hostUnlimited)

    /**
     * Convenience join — resolves the lobby's canonical code so the test
     * site exercises the happy-path. Tests that need to probe the
     * ADR-0027 code-gate deliberately use [joinWithCode] and pass a
     * wrong/null value explicitly. (A `code: String? = repo.findById(l)?.code?.value`
     * default would compile-fail: Kotlin disallows suspend calls in default
     * parameter values.)
     */
    suspend fun join(
        l: LobbyId,
        s: SessionId,
        p: Pseudonym,
    ): UseCaseOutcome<Lobby> {
        val code = repo.findById(l)?.code?.value
        return join.invoke(l, s, p, code)
    }

    suspend fun joinWithCode(
        l: LobbyId,
        s: SessionId,
        p: Pseudonym,
        code: String?,
    ) = join.invoke(l, s, p, code)

    suspend fun joinWithUserId(
        l: LobbyId,
        s: SessionId,
        p: Pseudonym,
        code: String?,
        userId: UserId?,
    ) = join.invoke(l, s, p, code, userId)

    suspend fun rename(
        l: LobbyId,
        s: SessionId,
        p: Pseudonym,
    ) = rename.invoke(l, s, p)

    suspend fun setConfig(
        l: LobbyId,
        s: SessionId,
        g: GridConfig,
    ) = setConfig.invoke(l, s, g)

    suspend fun start(
        l: LobbyId,
        s: SessionId,
    ) = start.invoke(l, s)

    suspend fun write(
        l: LobbyId,
        s: SessionId,
        p: Position,
        c: Letter?,
    ) = update.invoke(l, s, p, c)

    suspend fun leave(
        l: LobbyId,
        s: SessionId,
    ) = leave.invoke(l, s)

    suspend fun rotate(
        l: LobbyId,
        s: SessionId,
    ) = rotateCode.invoke(l, s)

    suspend fun claim(
        l: LobbyId,
        s: SessionId,
        userId: UserId,
        hostUnlimited: Boolean = false,
    ) = claim.invoke(l, s, userId, hostUnlimited)

    suspend fun relinquish(
        l: LobbyId,
        s: SessionId,
    ) = relinquish.invoke(l, s)

    suspend fun relinquishByUser(
        l: LobbyId,
        u: UserId,
    ) = relinquishByUser.invoke(l, u)

    suspend fun leaveMembership(
        l: LobbyId,
        u: UserId,
    ) = leaveMembership.invoke(l, u)

    // ADR-0066 anon->authed: a fresh authed join seats userId=null; the seat carries the userId only after this rebind.
    suspend fun rebind(
        s: SessionId,
        u: UserId,
        p: Pseudonym,
    ) = repo.rebindAnonSeats(STUB_JDBC_CONNECTION, s, u, p)
}

// InMemory rebindAnonSeats ignores the JDBC connection; a no-op proxy satisfies the signature.
private val STUB_JDBC_CONNECTION: java.sql.Connection =
    java.lang.reflect.Proxy
        .newProxyInstance(
            java.sql.Connection::class.java.classLoader,
            arrayOf(java.sql.Connection::class.java),
        ) { _, _, _ -> null } as java.sql.Connection

internal fun <T> UseCaseOutcome<T>.requireSuccess(): UseCaseResult<T> =
    when (this) {
        is UseCaseOutcome.Success -> result
        is UseCaseOutcome.Failure -> error("expected success, got $error")
    }
