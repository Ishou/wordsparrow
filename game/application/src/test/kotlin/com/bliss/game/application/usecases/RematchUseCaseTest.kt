package com.bliss.game.application.usecases

import assertk.assertThat
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import com.bliss.game.application.ports.LobbyEvent
import com.bliss.game.application.usecases.Samples.aPos
import com.bliss.game.application.usecases.Samples.alice
import com.bliss.game.application.usecases.Samples.bob
import com.bliss.game.application.usecases.Samples.pPos
import com.bliss.game.application.usecases.Samples.sessionA
import com.bliss.game.application.usecases.Samples.sessionB
import com.bliss.game.domain.Letter
import com.bliss.game.domain.Lobby
import com.bliss.game.domain.LobbyId
import com.bliss.game.domain.LobbyLifecycleState
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant

// ADR-0113: COMPLETED -> IN_PROGRESS rematch reusing the lobby's gridConfig.
class RematchUseCaseTest {
    private suspend fun Harness.completed(): Lobby {
        val lobby = create(sessionA, alice).value
        start(lobby.id, sessionA).requireSuccess()
        clock.advance(Duration.ofSeconds(2))
        write(lobby.id, sessionA, pPos, Letter('P')).requireSuccess()
        write(lobby.id, sessionA, aPos, Letter('A')).requireSuccess()
        val done = repo.findById(lobby.id)!!
        check(done.state == LobbyLifecycleState.COMPLETED) { "expected COMPLETED, got ${done.state}" }
        return done
    }

    @Test
    fun `Rematch from COMPLETED starts a fresh game and emits GameStarted`() =
        runTest {
            val h = Harness(Samples.cluedPuzzle())
            val completed = h.completed()

            val out = h.rematch(completed.id, sessionA).requireSuccess()

            assertThat(out.value.state).isEqualTo(LobbyLifecycleState.IN_PROGRESS)
            assertThat(out.value.game).isNotNull()
            assertThat(out.value.game?.entries).isEqualTo(emptyMap())
            assertThat(out.value.game?.lockedPositions).isEqualTo(emptyMap())
            assertThat(out.value.game?.completedAt).isNull()
            assertThat(out.value.gridConfig).isEqualTo(completed.gridConfig)
            assertThat(out.events).hasSize(1)
            assertThat(out.events[0]).isInstanceOf(LobbyEvent.GameStarted::class)
        }

    @Test
    fun `Rematch rejects a non-owner with NotOwner`() =
        runTest {
            val h = Harness(Samples.cluedPuzzle())
            val completed = h.completed()
            h.join(completed.id, sessionB, bob).requireSuccess()

            val out = h.rematch(completed.id, sessionB)

            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.NotOwner)
            assertThat(h.repo.findById(completed.id)!!.state).isEqualTo(LobbyLifecycleState.COMPLETED)
        }

    @Test
    fun `Rematch outside COMPLETED returns InvalidState`() =
        runTest {
            val h = Harness(Samples.cluedPuzzle())
            val lobby = h.create(sessionA, alice).value

            val out = h.rematch(lobby.id, sessionA)

            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.InvalidState)
        }

    @Test
    fun `Rematch returns LobbyNotFound for an unknown lobby`() =
        runTest {
            val h = Harness(Samples.cluedPuzzle())
            val out = h.rematch(LobbyId.generate(), sessionA)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.LobbyNotFound)
        }

    // Staleness guard: a timer scheduled for an earlier completion must not restart a newer one.
    @Test
    fun `Rematch with a mismatched expectedCompletedAt does not restart and stays COMPLETED`() =
        runTest {
            val h = Harness(Samples.cluedPuzzle())
            val completed = h.completed()
            val stale = Instant.parse("2020-01-01T00:00:00Z")

            val out = h.rematch(completed.id, sessionA, expectedCompletedAt = stale)

            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.InvalidState)
            assertThat(h.repo.findById(completed.id)!!.state).isEqualTo(LobbyLifecycleState.COMPLETED)
        }

    // The matching completedAt fires the rematch — the auto-restart's happy path.
    @Test
    fun `Rematch with the matching expectedCompletedAt restarts the game`() =
        runTest {
            val h = Harness(Samples.cluedPuzzle())
            val completed = h.completed()
            val completedAt = completed.game!!.completedAt

            val out = h.rematch(completed.id, sessionA, expectedCompletedAt = completedAt).requireSuccess()

            assertThat(out.value.state).isEqualTo(LobbyLifecycleState.IN_PROGRESS)
        }
}
