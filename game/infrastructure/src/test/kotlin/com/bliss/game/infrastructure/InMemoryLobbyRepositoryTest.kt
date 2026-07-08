package com.bliss.game.infrastructure

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.hasSize
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import com.bliss.game.application.ports.ClaimOutcome
import com.bliss.game.application.ports.RelinquishOutcome
import com.bliss.game.domain.GamePuzzle
import com.bliss.game.domain.GameSession
import com.bliss.game.domain.GridConfig
import com.bliss.game.domain.Lobby
import com.bliss.game.domain.LobbyCode
import com.bliss.game.domain.LobbyId
import com.bliss.game.domain.LobbyLifecycleState
import com.bliss.game.domain.Player
import com.bliss.game.domain.Pseudonym
import com.bliss.game.domain.SessionId
import com.bliss.game.domain.UserId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.lang.reflect.Proxy
import java.sql.Connection
import java.time.Instant
import java.util.UUID

private val STUB_CONN: Connection =
    Proxy.newProxyInstance(
        Connection::class.java.classLoader,
        arrayOf(Connection::class.java),
    ) { _, _, _ -> null } as Connection

class InMemoryLobbyRepositoryTest {
    private val sessionA = SessionId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b")
    private val userA = UserId("11111111-1111-1111-1111-111111111111")
    private val alice = Pseudonym("Alice")
    private val baseInstant: Instant = Instant.parse("2026-01-01T00:00:00Z")
    private val gridConfig = GridConfig(5, 5)

    private fun lobbyAt(
        id: LobbyId,
        joinedAt: Instant = baseInstant,
        ownerSessionId: SessionId = sessionA,
        ownerUserId: UserId? = null,
        state: LobbyLifecycleState = LobbyLifecycleState.WAITING,
        lastActivityAt: Instant = joinedAt,
        code: LobbyCode = LobbyCode.generate(),
    ): Lobby =
        Lobby(
            id = id,
            ownerSessionId = ownerSessionId,
            ownerUserId = ownerUserId,
            players = mapOf(ownerSessionId to Player(ownerSessionId, alice, joinedAt, userId = ownerUserId)),
            state = state,
            gridConfig = gridConfig,
            game = null,
            lastActivityAt = lastActivityAt,
            code = code,
        )

    @Test
    fun `save then findById returns the saved lobby`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val lobby = lobbyAt(LobbyId.generate())

            repo.save(lobby)

            assertThat(repo.findById(lobby.id)).isEqualTo(lobby)
        }

    @Test
    fun `findById returns null for unknown id`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            assertThat(repo.findById(LobbyId.generate())).isNull()
        }

    @Test
    fun `mutate applies the lambda and persists the new state`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val lobby = lobbyAt(LobbyId.generate())
            repo.save(lobby)

            val mutated = repo.mutate(lobby.id) { it.copy(state = LobbyLifecycleState.WAITING) }

            assertThat(mutated).isNotNull()
            assertThat(repo.findById(lobby.id)).isEqualTo(mutated)
        }

    @Test
    fun `mutate returns null when the lobby is absent`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val result = repo.mutate(LobbyId.generate()) { it }
            assertThat(result).isNull()
        }

    @Test
    fun `mutate returning null deletes the lobby atomically`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val lobby = lobbyAt(LobbyId.generate())
            repo.save(lobby)

            val out = repo.mutate(lobby.id) { null }

            assertThat(out).isNull()
            assertThat(repo.findById(lobby.id)).isNull()
        }

    @Test
    fun `delete removes the lobby`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val lobby = lobbyAt(LobbyId.generate())
            repo.save(lobby)

            repo.delete(lobby.id)

            assertThat(repo.findById(lobby.id)).isNull()
        }

    @Test
    fun `delete on absent lobby is a no-op`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            // Should not throw.
            repo.delete(LobbyId.generate())
        }

    // Verifies no lost writes under concurrent read-modify-write.
    @Test
    fun `concurrent mutate increments do not lose updates`() =
        runBlocking {
            val repo = InMemoryLobbyRepository()
            val id = LobbyId.generate()
            repo.save(lobbyAt(id))
            val iterations = 100

            coroutineScope {
                (1..iterations)
                    .map {
                        async(Dispatchers.Default) {
                            repo.mutate(id) { current ->
                                val owner = current.players.getValue(current.ownerSessionId)
                                val advanced = owner.joinedAt.plusSeconds(1)
                                current.copy(
                                    players =
                                        current.players +
                                            (current.ownerSessionId to owner.copy(joinedAt = advanced)),
                                )
                            }
                        }
                    }.awaitAll()
            }

            val finalJoinedAt =
                repo
                    .findById(id)!!
                    .players
                    .getValue(sessionA)
                    .joinedAt
            assertThat(finalJoinedAt).isEqualTo(baseInstant.plusSeconds(iterations.toLong()))
        }

    // Verifies no stranded state after mutate-vs-delete race, regardless of which wins the lock.
    @Test
    fun `mutate racing with delete leaves no stranded state`() =
        runBlocking {
            repeat(50) {
                val repo = InMemoryLobbyRepository()
                val id = LobbyId.generate()
                repo.save(lobbyAt(id))

                coroutineScope {
                    val mutator =
                        async(Dispatchers.Default) {
                            repo.mutate(id) { it.copy(state = LobbyLifecycleState.WAITING) }
                        }
                    val deleter =
                        async(Dispatchers.Default) {
                            repo.delete(id)
                        }
                    mutator.await()
                    deleter.await()
                }

                assertThat(repo.findById(id)).isNull()
                // A follow-up mutate must report absence, not blow up on a stranded lock.
                assertThat(repo.mutate(id) { it }).isNull()
            }
        }

    @Test
    fun `findWaitingByOwnerSession returns the WAITING lobby owned by the session`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val ownerLobby = lobbyAt(LobbyId.generate())
            repo.save(ownerLobby)

            val found = repo.findWaitingByOwnerSession(sessionA)

            assertThat(found).isNotNull()
            assertThat(found!!.id).isEqualTo(ownerLobby.id)
        }

    @Test
    fun `findWaitingByOwnerSession returns null when the owner has no WAITING lobby`() =
        runTest {
            val repo = InMemoryLobbyRepository()

            val found = repo.findWaitingByOwnerSession(sessionA)

            assertThat(found).isNull()
        }

    @Test
    fun `findWaitingByOwnerSession ignores lobbies owned by a different session`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val otherSession = SessionId("0190e3b2-1c45-7d2e-9a3f-c0d1e2f3a4b5")
            repo.save(lobbyAt(LobbyId.generate(), ownerSessionId = otherSession))

            val found = repo.findWaitingByOwnerSession(sessionA)

            assertThat(found).isNull()
        }

    @Test
    fun `findWaitingByOwnerUser returns the WAITING lobby whose owner seat holds the userId`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val ownerLobby = lobbyAt(LobbyId.generate(), ownerUserId = userA)
            repo.save(ownerLobby)

            val found = repo.findWaitingByOwnerUser(userA)

            assertThat(found).isNotNull()
            assertThat(found!!.id).isEqualTo(ownerLobby.id)
        }

    @Test
    fun `findWaitingByOwnerUser returns null when no waiting lobby carries the userId`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            repo.save(lobbyAt(LobbyId.generate(), ownerUserId = null))

            assertThat(repo.findWaitingByOwnerUser(userA)).isNull()
        }

    // A different user's WAITING lobby must not satisfy this user's quota.
    @Test
    fun `findWaitingByOwnerUser ignores lobbies owned by a different user`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val otherUser = UserId("22222222-2222-2222-2222-222222222222")
            repo.save(lobbyAt(LobbyId.generate(), ownerUserId = otherUser))

            assertThat(repo.findWaitingByOwnerUser(userA)).isNull()
        }

    @Test
    fun `findIdleWaiting returns lobbies whose lastActivityAt is at or before cutoff`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val stale = lobbyAt(LobbyId.generate(), lastActivityAt = baseInstant)
            val fresh = lobbyAt(LobbyId.generate(), lastActivityAt = baseInstant.plusSeconds(3600))
            repo.save(stale)
            repo.save(fresh)

            val cutoff = baseInstant.plusSeconds(60)
            val idle = repo.findIdleWaiting(cutoff)

            assertThat(idle).hasSize(1)
            assertThat(idle.map { it.id }).containsExactlyInAnyOrder(stale.id)
        }

    @Test
    fun `findIdleWaiting returns empty when no lobbies match the cutoff`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            repo.save(lobbyAt(LobbyId.generate(), lastActivityAt = baseInstant.plusSeconds(7200)))

            val idle = repo.findIdleWaiting(baseInstant)

            assertThat(idle).isEmpty()
        }

    @Test
    fun `findIdleCompleted returns completed lobbies at or before cutoff and excludes WAITING`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val staleCompleted = completedLobbyAt(LobbyId.generate(), lastActivityAt = baseInstant)
            val freshCompleted =
                completedLobbyAt(LobbyId.generate(), lastActivityAt = baseInstant.plusSeconds(3600))
            val staleWaiting = lobbyAt(LobbyId.generate(), lastActivityAt = baseInstant)
            repo.save(staleCompleted)
            repo.save(freshCompleted)
            repo.save(staleWaiting)

            val idle = repo.findIdleCompleted(baseInstant.plusSeconds(60))

            assertThat(idle).hasSize(1)
            assertThat(idle.map { it.id }).containsExactlyInAnyOrder(staleCompleted.id)
        }

    @Test
    fun `findIdleCompleted returns empty when no completed lobbies are at or before cutoff`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            repo.save(completedLobbyAt(LobbyId.generate(), lastActivityAt = baseInstant.plusSeconds(7200)))

            assertThat(repo.findIdleCompleted(baseInstant)).isEmpty()
        }

    private fun completedLobbyAt(
        id: LobbyId,
        ownerSessionId: SessionId = sessionA,
        ownerUserId: UserId? = null,
        lastActivityAt: Instant = baseInstant,
    ): Lobby {
        val puzzle =
            GamePuzzle(
                id = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5b00"),
                title = "Sample",
                language = "fr",
                width = 5,
                height = 5,
                cells = emptyList(),
                clues = emptyList(),
                createdAt = baseInstant.minusSeconds(3600),
            )
        return Lobby(
            id = id,
            ownerSessionId = ownerSessionId,
            ownerUserId = ownerUserId,
            players = mapOf(ownerSessionId to Player(ownerSessionId, alice, baseInstant, userId = ownerUserId)),
            state = LobbyLifecycleState.COMPLETED,
            gridConfig = gridConfig,
            game =
                GameSession(
                    puzzle = puzzle,
                    entries = emptyMap(),
                    startedAt = baseInstant.minusSeconds(1800),
                    completedAt = baseInstant.minusSeconds(60),
                ),
            lastActivityAt = lastActivityAt,
            code = LobbyCode.generate(),
        )
    }

    private fun inProgressLobbyAt(
        id: LobbyId,
        ownerSessionId: SessionId = sessionA,
        ownerUserId: UserId? = null,
        lastActivityAt: Instant = baseInstant,
    ): Lobby {
        val puzzle =
            GamePuzzle(
                id = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5b00"),
                title = "Sample",
                language = "fr",
                width = 5,
                height = 5,
                cells = emptyList(),
                clues = emptyList(),
                createdAt = baseInstant.minusSeconds(3600),
            )
        return Lobby(
            id = id,
            ownerSessionId = ownerSessionId,
            ownerUserId = ownerUserId,
            players = mapOf(ownerSessionId to Player(ownerSessionId, alice, baseInstant, userId = ownerUserId)),
            state = LobbyLifecycleState.IN_PROGRESS,
            gridConfig = gridConfig,
            game =
                GameSession(
                    puzzle = puzzle,
                    entries = emptyMap(),
                    startedAt = baseInstant.minusSeconds(1800),
                    completedAt = null,
                ),
            lastActivityAt = lastActivityAt,
            code = LobbyCode.generate(),
        )
    }

    private val userIdAlice = UserId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c")
    private val newDisplayName = Pseudonym("AliceSignedIn")

    @Test
    fun `rebindAnonSeats sets userId and pseudonym on matching seats and returns touched lobby ids`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val lobby1 = lobbyAt(LobbyId.generate())
            val lobby2 = lobbyAt(LobbyId.generate())
            repo.save(lobby1)
            repo.save(lobby2)

            val touched = repo.rebindAnonSeats(STUB_CONN, sessionA, userIdAlice, newDisplayName)

            assertThat(touched).containsExactlyInAnyOrder(lobby1.id, lobby2.id)
            val updated = repo.findById(lobby1.id)!!
            val seat = updated.players[sessionA]!!
            assertThat(seat.userId).isEqualTo(userIdAlice)
            assertThat(seat.pseudonym).isEqualTo(newDisplayName)
        }

    @Test
    fun `rebindAnonSeats is idempotent — already-bound seats are not touched twice`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val lobby = lobbyAt(LobbyId.generate())
            repo.save(lobby)
            repo.rebindAnonSeats(STUB_CONN, sessionA, userIdAlice, newDisplayName)

            val touchedAgain = repo.rebindAnonSeats(STUB_CONN, sessionA, userIdAlice, newDisplayName)

            assertThat(touchedAgain).isEmpty()
        }

    @Test
    fun `unbindUserSeats clears userId and reverts pseudonym, returns touched ids`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val lobby = lobbyAt(LobbyId.generate())
            repo.save(lobby)
            repo.rebindAnonSeats(STUB_CONN, sessionA, userIdAlice, newDisplayName)

            val anonName = Pseudonym("Marmotte 900")
            val touched = repo.unbindUserSeats(STUB_CONN, userIdAlice, anonName)

            assertThat(touched).containsExactlyInAnyOrder(lobby.id)
            val seat = repo.findById(lobby.id)!!.players[sessionA]!!
            assertThat(seat.userId).isNull()
            assertThat(seat.pseudonym).isEqualTo(anonName)
        }

    @Test
    fun `unbindUserSeats is idempotent — no userId matches returns empty`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val lobby = lobbyAt(LobbyId.generate())
            repo.save(lobby)

            val touched = repo.unbindUserSeats(STUB_CONN, userIdAlice, Pseudonym("Marmotte 900"))

            assertThat(touched).isEmpty()
        }

    private val replacementPseudonym = Pseudonym("Joueur supprime")

    @Test
    fun `anonymizeUserSeats clears userId and replaces pseudonym, returns touched lobby ids`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val lobby = lobbyAt(LobbyId.generate())
            repo.save(lobby)
            repo.rebindAnonSeats(STUB_CONN, sessionA, userIdAlice, newDisplayName)

            val touched = repo.anonymizeUserSeats(STUB_CONN, userIdAlice, replacementPseudonym)

            assertThat(touched).containsExactlyInAnyOrder(lobby.id)
            val seat = repo.findById(lobby.id)!!.players[sessionA]!!
            assertThat(seat.userId).isNull()
            assertThat(seat.pseudonym).isEqualTo(replacementPseudonym)
        }

    @Test
    fun `anonymizeUserSeats is idempotent - second call on already-anon seat returns empty set`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val lobby = lobbyAt(LobbyId.generate())
            repo.save(lobby)
            repo.rebindAnonSeats(STUB_CONN, sessionA, userIdAlice, newDisplayName)
            repo.anonymizeUserSeats(STUB_CONN, userIdAlice, replacementPseudonym)

            val touchedAgain = repo.anonymizeUserSeats(STUB_CONN, userIdAlice, replacementPseudonym)

            assertThat(touchedAgain).isEmpty()
        }

    @Test
    fun `refreshUserPseudonym updates pseudonym and returns touched ids`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val lobby = lobbyAt(LobbyId.generate())
            repo.save(lobby)
            repo.rebindAnonSeats(STUB_CONN, sessionA, userIdAlice, newDisplayName)

            val renamedPseudonym = Pseudonym("AliceRenamed")
            val touched = repo.refreshUserPseudonym(STUB_CONN, userIdAlice, renamedPseudonym)

            assertThat(touched).containsExactlyInAnyOrder(lobby.id)
            val seat = repo.findById(lobby.id)!!.players[sessionA]!!
            assertThat(seat.userId).isEqualTo(userIdAlice)
            assertThat(seat.pseudonym).isEqualTo(renamedPseudonym)
        }

    @Test
    fun `refreshUserPseudonym is idempotent - seat already on new pseudonym returns empty set`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val lobby = lobbyAt(LobbyId.generate())
            repo.save(lobby)
            repo.rebindAnonSeats(STUB_CONN, sessionA, userIdAlice, newDisplayName)

            val renamedPseudonym = Pseudonym("AliceRenamed")
            repo.refreshUserPseudonym(STUB_CONN, userIdAlice, renamedPseudonym)

            val touchedAgain = repo.refreshUserPseudonym(STUB_CONN, userIdAlice, renamedPseudonym)

            assertThat(touchedAgain).isEmpty()
        }

    // ADR-0066 amendment 2026-07-05 regression: the owner arm keeps a started lobby on the user tab after the leave-grace drops the owner's seat (no seat then carries the userId).
    @Test
    fun `findByUserId still returns an owner-owned lobby after the owner leaves`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val lobby = completedLobbyAt(LobbyId.generate(), ownerSessionId = sessionA, ownerUserId = userA)
            repo.save(lobby)

            // Leave-grace equivalent: LeaveLobbyUseCase drops the owner's seat, keeping the row.
            val afterLeave = repo.mutate(lobby.id) { it.copy(players = it.players - sessionA) }

            assertThat(afterLeave).isNotNull()
            assertThat(afterLeave!!.players).isEmpty()
            assertThat(repo.findByUserId(userA).map { it.id }).containsExactlyInAnyOrder(lobby.id)
        }

    // ADR-0055/0066 regression: once the leave-grace drops the owner seat, only ownerUserId marks the lobby as authed — the GC must not collect it despite there being no authed seat.
    @Test
    fun `findIdleCompleted excludes an owner-owned lobby after the owner seat is gone`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val ownerOwned = completedLobbyAt(LobbyId.generate(), ownerUserId = userA, lastActivityAt = baseInstant)
            repo.save(ownerOwned)
            // Leave-grace equivalent: the owner's seat is dropped, keeping the row and ownerUserId.
            repo.mutate(ownerOwned.id) { it.copy(players = it.players - sessionA) }
            val anonIdle = completedLobbyAt(LobbyId.generate(), lastActivityAt = baseInstant)
            repo.save(anonIdle)

            val idle = repo.findIdleCompleted(baseInstant.plusSeconds(60))

            assertThat(idle.map { it.id }).containsExactlyInAnyOrder(anonIdle.id)
        }

    // ADR-0098 §3 erasure parity with Postgres: rule 2 vacates to ownerless rather than transferring.
    @Test
    fun `eraseSession rule 2 vacates ownership to ownerless`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val sessionB = SessionId("0190e3b2-1c45-7d2e-9a3f-c0d1e2f3a4b5")
            val remainingUserId = UserId("99999999-9999-9999-9999-999999999999")
            val lobby =
                Lobby(
                    id = LobbyId.generate(),
                    ownerSessionId = sessionA,
                    ownerUserId = userA,
                    players =
                        mapOf(
                            sessionA to Player(sessionA, alice, baseInstant, userId = userA),
                            sessionB to Player(sessionB, Pseudonym("Bob"), baseInstant.plusSeconds(10), userId = remainingUserId),
                        ),
                    state = LobbyLifecycleState.WAITING,
                    gridConfig = gridConfig,
                    game = null,
                    lastActivityAt = baseInstant,
                    code = LobbyCode.generate(),
                )
            repo.save(lobby)

            val result = repo.eraseSession(sessionA)

            assertThat(result.vacatedLobbies).isEqualTo(1)
            val after = repo.findById(lobby.id)!!
            assertThat(after.ownerUserId).isNull()
            assertThat(after.ownerSessionId).isEqualTo(SessionId.ANON)
            assertThat(after.players.keys).containsExactlyInAnyOrder(sessionB)
        }

    @Test
    fun `findActiveByOwnerUser returns a WAITING or IN_PROGRESS owned lobby and ignores COMPLETED and ownerless`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val waiting = lobbyAt(LobbyId.generate(), ownerUserId = userA)
            val inProgress = inProgressLobbyAt(LobbyId.generate(), ownerUserId = userA)
            repo.save(waiting)

            assertThat(repo.findActiveByOwnerUser(userA)!!.id).isEqualTo(waiting.id)

            repo.delete(waiting.id)
            repo.save(inProgress)
            assertThat(repo.findActiveByOwnerUser(userA)!!.id).isEqualTo(inProgress.id)

            repo.delete(inProgress.id)
            repo.save(completedLobbyAt(LobbyId.generate(), ownerUserId = userA))
            assertThat(repo.findActiveByOwnerUser(userA)).isNull()

            repo.save(lobbyAt(LobbyId.generate(), ownerUserId = null))
            assertThat(repo.findActiveByOwnerUser(userA)).isNull()
        }

    @Test
    fun `findIdleOwnerless returns ownerless non-terminal lobbies at or before the cutoff`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val idle = lobbyAt(LobbyId.generate(), ownerUserId = null, lastActivityAt = baseInstant)
            val owned = lobbyAt(LobbyId.generate(), ownerUserId = userA, lastActivityAt = baseInstant)
            val fresh =
                lobbyAt(LobbyId.generate(), ownerUserId = null, lastActivityAt = baseInstant.plusSeconds(3600))
            val completedOwnerless = completedLobbyAt(LobbyId.generate(), ownerUserId = null, lastActivityAt = baseInstant)
            repo.save(idle)
            repo.save(owned)
            repo.save(fresh)
            repo.save(completedOwnerless)

            val result = repo.findIdleOwnerless(baseInstant.plusSeconds(60))

            assertThat(result.map { it.id }).containsExactlyInAnyOrder(idle.id)
        }

    // Default relinquish/claim (mutate composition) is correct for the in-memory adapter.
    @Test
    fun `relinquishOwnership drops the caller to ownerless and removes their seat`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val sessionB = SessionId("0190e3b2-1c45-7d2e-9a3f-c0d1e2f3a4b5")
            val base = inProgressLobbyAt(LobbyId.generate(), ownerUserId = userA)
            val withOther =
                base.copy(
                    players = base.players + (sessionB to Player(sessionB, Pseudonym("Bob"), baseInstant.plusSeconds(10))),
                )
            repo.save(withOther)

            val now = baseInstant.plusSeconds(120)
            val outcome = repo.relinquishOwnership(withOther.id, sessionA, now)

            assertThat(outcome).isInstanceOf(RelinquishOutcome.Relinquished::class)
            val after = repo.findById(withOther.id)!!
            assertThat(after.ownerUserId).isNull()
            assertThat(after.players.keys).containsExactlyInAnyOrder(sessionB)
            assertThat(repo.findActiveByOwnerUser(userA)).isNull()
        }

    @Test
    fun `relinquishOwnershipByUser drops to ownerless and removes the former owner seat`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val sessionB = SessionId("0190e3b2-1c45-7d2e-9a3f-c0d1e2f3a4b5")
            val base = inProgressLobbyAt(LobbyId.generate(), ownerUserId = userA)
            val withOther =
                base.copy(
                    players = base.players + (sessionB to Player(sessionB, Pseudonym("Bob"), baseInstant.plusSeconds(10))),
                )
            repo.save(withOther)

            val now = baseInstant.plusSeconds(120)
            val outcome = repo.relinquishOwnershipByUser(withOther.id, userA, now)

            assertThat(outcome).isInstanceOf(RelinquishOutcome.Relinquished::class)
            val after = repo.findById(withOther.id)!!
            assertThat(after.ownerUserId).isNull()
            // Former owner seat (sessionA) dropped; the co-player keeps their seat.
            assertThat(after.players.keys).containsExactlyInAnyOrder(sessionB)
            assertThat(repo.findActiveByOwnerUser(userA)).isNull()
        }

    @Test
    fun `relinquishOwnershipByUser returns NotOwner when the userId does not own the lobby`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val userB = UserId("22222222-2222-2222-2222-222222222222")
            val base = inProgressLobbyAt(LobbyId.generate(), ownerUserId = userA)
            repo.save(base)

            val outcome = repo.relinquishOwnershipByUser(base.id, userB, baseInstant.plusSeconds(120))

            assertThat(outcome).isEqualTo(RelinquishOutcome.NotOwner)
            assertThat(repo.findById(base.id)!!.ownerUserId).isEqualTo(userA)
        }

    @Test
    fun `claimOwnership binds ownership to a present claimer on an ownerless lobby`() =
        runTest {
            val repo = InMemoryLobbyRepository()
            val sessionB = SessionId("0190e3b2-1c45-7d2e-9a3f-c0d1e2f3a4b5")
            val userB = UserId("22222222-2222-2222-2222-222222222222")
            val ownerless =
                inProgressLobbyAt(LobbyId.generate(), ownerSessionId = SessionId.ANON, ownerUserId = null)
                    .let {
                        it.copy(
                            players =
                                mapOf(
                                    sessionB to Player(sessionB, Pseudonym("Bob"), baseInstant.plusSeconds(10), userId = userB),
                                ),
                        )
                    }
            repo.save(ownerless)

            val outcome = repo.claimOwnership(ownerless.id, sessionB, userB, baseInstant.plusSeconds(200))

            assertThat(outcome).isInstanceOf(ClaimOutcome.Claimed::class)
            val after = repo.findById(ownerless.id)!!
            assertThat(after.ownerUserId).isEqualTo(userB)
            assertThat(after.ownerSessionId).isEqualTo(sessionB)
            assertThat(repo.findActiveByOwnerUser(userB)!!.id).isEqualTo(ownerless.id)
        }
}
