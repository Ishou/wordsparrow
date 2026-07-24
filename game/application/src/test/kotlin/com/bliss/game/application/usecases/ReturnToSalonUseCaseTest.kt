package com.bliss.game.application.usecases

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.isEqualTo
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
import com.bliss.game.domain.PlayerId
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Duration

// ADR-0113: COMPLETED -> WAITING return-to-salon, clearing the game but keeping players/owner/code.
class ReturnToSalonUseCaseTest {
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
    fun `ReturnToSalon moves COMPLETED to WAITING, clears the game, and emits ReturnedToSalon`() =
        runTest {
            val h = Harness(Samples.cluedPuzzle())
            val completed = h.completed()
            val code = completed.code

            val out = h.returnToSalon(completed.id, sessionA).requireSuccess()

            assertThat(out.value.state).isEqualTo(LobbyLifecycleState.WAITING)
            assertThat(out.value.game).isNull()
            assertThat(out.value.code).isEqualTo(code)
            assertThat(out.value.ownerSessionId).isEqualTo(sessionA)
            assertThat(out.events).containsExactly(LobbyEvent.ReturnedToSalon)
        }

    @Test
    fun `ReturnToSalon keeps the players seated`() =
        runTest {
            val h = Harness(Samples.cluedPuzzle())
            val lobby = h.create(sessionA, alice).value
            h.join(lobby.id, sessionB, bob).requireSuccess()
            h.start(lobby.id, sessionA).requireSuccess()
            h.clock.advance(Duration.ofSeconds(2))
            h.write(lobby.id, sessionA, pPos, Letter('P')).requireSuccess()
            h.write(lobby.id, sessionA, aPos, Letter('A')).requireSuccess()

            val out = h.returnToSalon(lobby.id, sessionA).requireSuccess()

            assertThat(out.value.players.keys).isEqualTo(setOf(PlayerId(sessionA.value), PlayerId(sessionB.value)))
        }

    @Test
    fun `ReturnToSalon rejects a non-owner with NotOwner`() =
        runTest {
            val h = Harness(Samples.cluedPuzzle())
            val completed = h.completed()
            h.join(completed.id, sessionB, bob).requireSuccess()

            val out = h.returnToSalon(completed.id, sessionB)

            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.NotOwner)
            assertThat(h.repo.findById(completed.id)!!.state).isEqualTo(LobbyLifecycleState.COMPLETED)
        }

    @Test
    fun `ReturnToSalon outside COMPLETED returns InvalidState`() =
        runTest {
            val h = Harness(Samples.cluedPuzzle())
            val lobby = h.create(sessionA, alice).value
            h.start(lobby.id, sessionA).requireSuccess()

            val out = h.returnToSalon(lobby.id, sessionA)

            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.InvalidState)
        }

    @Test
    fun `ReturnToSalon returns LobbyNotFound for an unknown lobby`() =
        runTest {
            val h = Harness(Samples.cluedPuzzle())
            val out = h.returnToSalon(LobbyId.generate(), sessionA)
            assertThat((out as UseCaseOutcome.Failure).error).isEqualTo(UseCaseError.LobbyNotFound)
        }
}
