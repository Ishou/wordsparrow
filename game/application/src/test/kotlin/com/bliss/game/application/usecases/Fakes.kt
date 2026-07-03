package com.bliss.game.application.usecases

import com.bliss.game.application.ports.Clock
import com.bliss.game.application.ports.EraseSessionResult
import com.bliss.game.application.ports.LobbyRepository
import com.bliss.game.application.ports.PuzzleProvider
import com.bliss.game.domain.BlockCell
import com.bliss.game.domain.GameClue
import com.bliss.game.domain.GamePuzzle
import com.bliss.game.domain.Letter
import com.bliss.game.domain.LetterCell
import com.bliss.game.domain.Lobby
import com.bliss.game.domain.LobbyCode
import com.bliss.game.domain.LobbyId
import com.bliss.game.domain.LobbyLifecycleState
import com.bliss.game.domain.Position
import com.bliss.game.domain.Pseudonym
import com.bliss.game.domain.SessionId
import com.bliss.game.domain.UserId
import java.sql.Connection
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/** Test-double clock with a manually advanced [instant]. Thread-safe enough for races. */
class FakeClock(
    var instant: Instant = Instant.parse("2026-01-01T00:00:00Z"),
) : Clock {
    @Synchronized
    override fun now(): Instant = instant

    @Synchronized
    fun advance(d: Duration) {
        instant = instant.plus(d)
    }
}

/** Tiny in-memory repository. Mirrors the contract Wave D will implement: per-lobby ReentrantLock. */
class InMemoryLobbyRepository : LobbyRepository {
    private val store = LinkedHashMap<LobbyId, Lobby>()
    private val locks = HashMap<LobbyId, ReentrantLock>()
    private val storeLock = ReentrantLock()

    private fun lockFor(id: LobbyId): ReentrantLock = storeLock.withLock { locks.getOrPut(id) { ReentrantLock() } }

    override suspend fun findById(id: LobbyId): Lobby? = storeLock.withLock { store[id] }

    override suspend fun findByCode(code: LobbyCode): Lobby? =
        storeLock.withLock {
            store.values.firstOrNull { it.code == code }
        }

    // owner OR member, state != WAITING (ADR-0039, 2026-05-13 amendment).
    override suspend fun findBySessionId(sessionId: SessionId): List<Lobby> =
        storeLock.withLock {
            store.values
                .filter {
                    (it.ownerSessionId == sessionId || it.players.containsKey(sessionId)) &&
                        it.state != LobbyLifecycleState.WAITING
                }.sortedByDescending { it.lastActivityAt }
        }

    override suspend fun findByUserId(userId: UserId): List<Lobby> =
        storeLock.withLock {
            store.values
                .filter { lobby ->
                    lobby.players.values.any { it.userId == userId } &&
                        lobby.state != LobbyLifecycleState.WAITING
                }.sortedByDescending { it.lastActivityAt }
        }

    override suspend fun save(lobby: Lobby): Lobby =
        lockFor(lobby.id).withLock {
            storeLock.withLock { store[lobby.id] = lobby }
            lobby
        }

    override suspend fun mutate(
        id: LobbyId,
        mutator: (Lobby) -> Lobby?,
    ): Lobby? =
        lockFor(id).withLock {
            val current = storeLock.withLock { store[id] } ?: return null
            val next = mutator(current)
            storeLock.withLock {
                if (next == null) {
                    store.remove(id)
                    locks.remove(id)
                } else {
                    store[id] = next
                }
            }
            next
        }

    override suspend fun delete(id: LobbyId) {
        storeLock.withLock {
            store.remove(id)
            locks.remove(id)
        }
    }

    override suspend fun findWaitingByOwnerSession(ownerSessionId: SessionId): Lobby? =
        storeLock.withLock {
            store.values.firstOrNull {
                it.ownerSessionId == ownerSessionId && it.state == LobbyLifecycleState.WAITING
            }
        }

    override suspend fun findWaitingByOwnerUser(userId: UserId): Lobby? =
        storeLock.withLock {
            store.values.firstOrNull {
                it.state == LobbyLifecycleState.WAITING && it.players[it.ownerSessionId]?.userId == userId
            }
        }

    override suspend fun findIdleWaiting(cutoff: Instant): List<Lobby> =
        storeLock.withLock {
            store.values
                .filter { it.state == LobbyLifecycleState.WAITING && !it.lastActivityAt.isAfter(cutoff) }
                .toList()
        }

    override suspend fun findIdleCompleted(cutoff: Instant): List<Lobby> =
        storeLock.withLock {
            store.values
                .filter { lobby ->
                    lobby.state == LobbyLifecycleState.COMPLETED &&
                        !lobby.lastActivityAt.isAfter(cutoff) &&
                        lobby.players.values.none { it.userId != null }
                }.toList()
        }

    // RGPD erasure mirror of the production InMemoryLobbyRepository (ADR-0039).
    override suspend fun eraseSession(sessionId: SessionId): EraseSessionResult {
        var deletedLobbies = 0
        var transferredLobbies = 0
        var removedPlayerships = 0
        var anonymisedEntries = 0
        val targets =
            storeLock.withLock {
                store.values.filter { it.players.containsKey(sessionId) }.map { it.id }
            }
        for (id in targets) {
            lockFor(id).withLock {
                val current = storeLock.withLock { store[id] } ?: return@withLock
                if (!current.players.containsKey(sessionId)) return@withLock
                val remaining = current.players - sessionId
                if (current.isOwner(sessionId) && remaining.isEmpty()) {
                    storeLock.withLock {
                        store.remove(id)
                        locks.remove(id)
                    }
                    deletedLobbies += 1
                    return@withLock
                }
                removedPlayerships += 1
                val newOwner =
                    if (current.isOwner(sessionId)) {
                        transferredLobbies += 1
                        remaining.values.minBy { it.joinedAt }.sessionId
                    } else {
                        current.ownerSessionId
                    }
                val newGame =
                    current.game?.let { game ->
                        var count = 0
                        val rewritten =
                            game.entries.mapValues { (_, entry) ->
                                if (entry.sessionId == sessionId) {
                                    count += 1
                                    entry.copy(sessionId = com.bliss.game.domain.SessionId.ANON)
                                } else {
                                    entry
                                }
                            }
                        anonymisedEntries += count
                        game.copy(entries = rewritten)
                    }
                storeLock.withLock {
                    store[id] =
                        current.copy(
                            players = remaining,
                            ownerSessionId = newOwner,
                            game = newGame,
                        )
                }
            }
        }
        return EraseSessionResult(deletedLobbies, transferredLobbies, removedPlayerships, anonymisedEntries)
    }

    override suspend fun rebindAnonSeats(
        conn: Connection,
        anonSessionId: SessionId,
        userId: UserId,
        newPseudonym: Pseudonym,
    ): Set<LobbyId> {
        val touched = mutableSetOf<LobbyId>()
        storeLock.withLock {
            store.entries.forEach { (id, lobby) ->
                val seat = lobby.players[anonSessionId] ?: return@forEach
                if (seat.userId != null) return@forEach
                val updated = seat.copy(userId = userId, pseudonym = newPseudonym)
                store[id] = lobby.copy(players = lobby.players + (anonSessionId to updated))
                touched += id
            }
        }
        return touched
    }

    override suspend fun unbindUserSeats(
        conn: Connection,
        userId: UserId,
        anonPseudonym: Pseudonym,
    ): Set<LobbyId> {
        val touched = mutableSetOf<LobbyId>()
        storeLock.withLock {
            store.entries.forEach { (id, lobby) ->
                val matches = lobby.players.values.any { it.userId == userId }
                if (!matches) return@forEach
                val newPlayers =
                    lobby.players.mapValues { (_, p) ->
                        if (p.userId == userId) p.copy(userId = null, pseudonym = anonPseudonym) else p
                    }
                store[id] = lobby.copy(players = newPlayers)
                touched += id
            }
        }
        return touched
    }

    override suspend fun anonymizeUserSeats(
        conn: Connection,
        userId: UserId,
        replacementPseudonym: Pseudonym,
    ): Set<LobbyId> {
        val touched = mutableSetOf<LobbyId>()
        storeLock.withLock {
            store.entries.forEach { (id, lobby) ->
                if (lobby.players.values.none { it.userId == userId }) return@forEach
                val newPlayers =
                    lobby.players.mapValues { (_, p) ->
                        if (p.userId == userId) p.copy(userId = null, pseudonym = replacementPseudonym) else p
                    }
                store[id] = lobby.copy(players = newPlayers)
                touched += id
            }
        }
        return touched
    }

    override suspend fun refreshUserPseudonym(
        conn: Connection,
        userId: UserId,
        newPseudonym: Pseudonym,
    ): Set<LobbyId> {
        val touched = mutableSetOf<LobbyId>()
        storeLock.withLock {
            store.entries.forEach { (id, lobby) ->
                if (lobby.players.values.none { it.userId == userId && it.pseudonym != newPseudonym }) return@forEach
                val newPlayers =
                    lobby.players.mapValues { (_, p) ->
                        if (p.userId == userId && p.pseudonym != newPseudonym) p.copy(pseudonym = newPseudonym) else p
                    }
                store[id] = lobby.copy(players = newPlayers)
                touched += id
            }
        }
        return touched
    }
}

/** Returns the puzzle handed at construction time, regardless of width/height. */
class FakePuzzleProvider(
    private val supplier: (Int, Int) -> GamePuzzle,
) : PuzzleProvider {
    constructor(puzzle: GamePuzzle) : this({ _, _ -> puzzle })

    override suspend fun fetch(
        width: Int,
        height: Int,
    ): GamePuzzle = supplier(width, height)
}

/**
 * In-memory [com.bliss.game.application.ports.WordValidator] for tests.
 * A word is correct iff every submitted cell matches the answer table —
 * same contract as grid's per-word `POST /validate-word` (ADR-0084).
 * Defaults to an empty answer table (no word ever reads as correct),
 * matching the production behavior of a puzzle whose answers are absent.
 * [failingPositions] simulates a validator outage for words touching those positions.
 */
class FakeWordValidator(
    private val answers: Map<com.bliss.game.domain.Position, com.bliss.game.domain.Letter> = emptyMap(),
    private val failingPositions: Set<com.bliss.game.domain.Position> = emptySet(),
) : com.bliss.game.application.ports.WordValidator {
    override suspend fun isWordCorrect(
        puzzleId: java.util.UUID,
        word: Map<com.bliss.game.domain.Position, com.bliss.game.domain.Letter>,
    ): Boolean {
        if (word.keys.any { it in failingPositions }) throw RuntimeException("simulated word-validate outage")
        return word.isNotEmpty() && word.all { (pos, letter) -> answers[pos] == letter }
    }
}

internal object Samples {
    val sessionA = SessionId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b")
    val sessionB = SessionId("0190e3b2-1c45-7d2e-9a3f-b0c1d2e3f4a5")
    val sessionC = SessionId("0190e3b3-2d56-7e3f-8a4b-c1d2e3f4a5b6")
    val userA = UserId("11111111-1111-1111-1111-111111111111")
    val userB = UserId("22222222-2222-2222-2222-222222222222")
    val alice = Pseudonym("Alice")
    val bob = Pseudonym("Bob")

    val pPos = Position(0, 3)
    val aPos = Position(0, 4)

    /** Two-letter puzzle (P, A). Solved when both are placed correctly. */
    fun puzzle(): GamePuzzle =
        GamePuzzle(
            id = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c"),
            title = "Petite grille",
            language = "fr",
            width = 5,
            height = 5,
            cells =
                listOf(
                    BlockCell(Position(0, 0)),
                    LetterCell(pPos, Letter('P')),
                    LetterCell(aPos, Letter('A')),
                ),
            clues = emptyList<GameClue>(),
            createdAt = Instant.parse("2026-01-01T00:00:00Z"),
        )
}
