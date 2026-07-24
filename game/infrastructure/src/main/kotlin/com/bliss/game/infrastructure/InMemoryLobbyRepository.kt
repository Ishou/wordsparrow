package com.bliss.game.infrastructure

import com.bliss.game.application.ports.EraseSessionResult
import com.bliss.game.application.ports.LobbyRepository
import com.bliss.game.domain.Lobby
import com.bliss.game.domain.LobbyCode
import com.bliss.game.domain.LobbyId
import com.bliss.game.domain.LobbyLifecycleState
import com.bliss.game.domain.Player
import com.bliss.game.domain.Pseudonym
import com.bliss.game.domain.SessionId
import com.bliss.game.domain.UserId
import java.sql.Connection
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

// In-memory adapter; state is lost on restart — acceptable until the Postgres adapter lands.
class InMemoryLobbyRepository : LobbyRepository {
    private val store: ConcurrentHashMap<LobbyId, Lobby> = ConcurrentHashMap()
    private val locks: ConcurrentHashMap<LobbyId, ReentrantLock> = ConcurrentHashMap()

    private fun lockFor(id: LobbyId): ReentrantLock = locks.computeIfAbsent(id) { ReentrantLock() }

    override suspend fun findById(id: LobbyId): Lobby? = store[id]

    // O(n) scan; same trade-off as findWaitingByOwnerSession above. Volume
    // stays small in v1 and a Postgres adapter would index `code`.
    override suspend fun findByCode(code: LobbyCode): Lobby? = store.values.firstOrNull { it.code == code }

    // owner OR member, state != WAITING; ownership survives leave-grace (ADR-0039, 2026-05-13).
    override suspend fun findBySessionId(sessionId: SessionId): List<Lobby> =
        store.values
            .filter {
                (it.ownerSessionId == sessionId || it.seatBySession(sessionId) != null) &&
                    it.state != LobbyLifecycleState.WAITING
            }.sortedByDescending { it.lastActivityAt }

    // owner arm mirrors findBySessionId; ownership survives leave-grace (ADR-0066 amendment 2026-07-05).
    override suspend fun findByUserId(userId: UserId): List<Lobby> =
        store.values
            .filter { lobby ->
                (lobby.ownerUserId == userId || lobby.players.values.any { it.userId == userId }) &&
                    lobby.state != LobbyLifecycleState.WAITING
            }.sortedByDescending { it.lastActivityAt }

    override suspend fun save(lobby: Lobby): Lobby =
        lockFor(lobby.id).withLock {
            store[lobby.id] = lobby
            lobby
        }

    override suspend fun mutate(
        id: LobbyId,
        mutator: (Lobby) -> Lobby?,
    ): Lobby? =
        lockFor(id).withLock {
            val current = store[id] ?: return@withLock null
            val next = mutator(current)
            if (next == null) {
                store.remove(id)
                locks.remove(id)
                null
            } else {
                store[id] = next
                next
            }
        }

    override suspend fun delete(id: LobbyId) {
        lockFor(id).withLock {
            store.remove(id)
            locks.remove(id)
        }
    }

    // O(n) scan over the lobby map. Acceptable for v1 single-replica (ADR-0018 §3); a Postgres
    // adapter would index (owner_session_id, state) for this lookup. ConcurrentHashMap.values()
    // is weakly consistent — fine: callers re-validate inside mutate() before acting on the result.
    override suspend fun findWaitingByOwnerSession(ownerSessionId: SessionId): Lobby? =
        store.values.firstOrNull { it.ownerSessionId == ownerSessionId && it.state == LobbyLifecycleState.WAITING }

    // Owner seat's userId, not sessionId — the ADR-0083 quota is per signed-in user (see findWaitingByOwnerUser doc).
    override suspend fun findWaitingByOwnerUser(userId: UserId): Lobby? =
        store.values.firstOrNull {
            it.state == LobbyLifecycleState.WAITING && it.seatBySession(it.ownerSessionId)?.userId == userId
        }

    // ADR-0098 §1: sticky active-game quota keyed on ownerUserId; non-terminal (not COMPLETED) counts.
    override suspend fun findActiveByOwnerUser(userId: UserId): Lobby? =
        store.values.firstOrNull {
            it.ownerUserId == userId && it.state != LobbyLifecycleState.COMPLETED
        }

    // ADR-0098 §4: ownerless non-terminal lobbies idle past the cutoff -- the relinquished/RGPD-vacated sweep.
    override suspend fun findIdleOwnerless(cutoff: Instant): List<Lobby> =
        store.values.filter {
            it.ownerUserId == null &&
                it.state != LobbyLifecycleState.COMPLETED &&
                !it.lastActivityAt.isAfter(cutoff)
        }

    override suspend fun findIdleWaiting(cutoff: Instant): List<Lobby> =
        store.values.filter { it.state == LobbyLifecycleState.WAITING && !it.lastActivityAt.isAfter(cutoff) }

    // ADR-0055 amendment 2026-07-09: IN_PROGRESS ghosts idle past 30d -- INACTIVITY, not age.
    override suspend fun findIdleInProgress(cutoff: Instant): List<Lobby> =
        store.values.filter { it.state == LobbyLifecycleState.IN_PROGRESS && !it.lastActivityAt.isAfter(cutoff) }

    // owner arm mirrors findByUserId so an authed-owned COMPLETED lobby is not GC'd after the leave-grace drops the owner seat (ADR-0055/0066).
    override suspend fun findIdleCompleted(cutoff: Instant): List<Lobby> =
        store.values.filter { lobby ->
            lobby.state == LobbyLifecycleState.COMPLETED &&
                !lobby.lastActivityAt.isAfter(cutoff) &&
                lobby.ownerUserId == null &&
                lobby.players.values.none { it.userId != null }
        }

    // RGPD Article 17 erasure (ADR-0039). Snapshot the affected lobby ids first, then
    // process each under its own per-lobby lock so the cascade is atomic per lobby.
    // ConcurrentHashMap.values() is weakly consistent — fine, we re-validate inside
    // the lock and a lobby created after the snapshot cannot reference an erased
    // session (the client cleared its session id before issuing the DELETE).
    override suspend fun eraseSession(sessionId: SessionId): EraseSessionResult {
        var deletedLobbies = 0
        var vacatedLobbies = 0
        var removedPlayerships = 0
        var anonymisedEntries = 0
        val targets = store.values.filter { it.seatBySession(sessionId) != null }.map { it.id }
        for (id in targets) {
            lockFor(id).withLock {
                val current = store[id] ?: return@withLock
                val seat = current.seatBySession(sessionId) ?: return@withLock
                val remaining = current.players - seat.playerId
                // Erase empties a lobby nobody will own (sole owner or already-ownerless) -> delete outright (ADR-0055/0098).
                if (remaining.isEmpty() && (current.isOwner(sessionId) || current.isOwnerless())) {
                    store.remove(id)
                    locks.remove(id)
                    deletedLobbies += 1
                    return@withLock
                }
                removedPlayerships += 1
                val newOwnerSession: SessionId
                val newOwnerUserId: UserId?
                if (current.isOwner(sessionId)) {
                    // Rule 2 (ADR-0098 §3): vacate to ownerless - owner_user_id cleared, owner_session_id set to the anon sentinel.
                    vacatedLobbies += 1
                    newOwnerSession = SessionId.ANON
                    newOwnerUserId = null
                } else {
                    // Rule 3: non-owner. Ownership unchanged.
                    newOwnerSession = current.ownerSessionId
                    newOwnerUserId = current.ownerUserId
                }
                val newGame =
                    current.game?.let { game ->
                        var count = 0
                        val rewritten =
                            game.entries.mapValues { (_, entry) ->
                                if (entry.sessionId == sessionId) {
                                    count += 1
                                    entry.copy(sessionId = SessionId.ANON)
                                } else {
                                    entry
                                }
                            }
                        anonymisedEntries += count
                        game.copy(entries = rewritten)
                    }
                store[id] =
                    current.copy(
                        players = remaining,
                        ownerSessionId = newOwnerSession,
                        ownerUserId = newOwnerUserId,
                        game = newGame,
                    )
            }
        }
        return EraseSessionResult(deletedLobbies, vacatedLobbies, removedPlayerships, anonymisedEntries)
    }

    override suspend fun rebindAnonSeats(
        conn: Connection,
        anonSessionId: SessionId,
        userId: UserId,
        newPseudonym: Pseudonym,
    ): Set<LobbyId> {
        val touched = mutableSetOf<LobbyId>()
        val targets = store.values.filter { it.seatBySession(anonSessionId)?.userId == null }.map { it.id }
        for (id in targets) {
            lockFor(id).withLock {
                val current = store[id] ?: return@withLock
                val seat = current.seatBySession(anonSessionId) ?: return@withLock
                if (seat.userId != null) return@withLock
                // Mid-game sign-in (ADR-0066 (c)/(e)): re-key the seat sessionId->userId and re-attribute its locks to the new playerId.
                val updated = seat.copy(userId = userId, pseudonym = newPseudonym)
                store[id] = current.rekeyedSeat(seat, updated)
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
        val targets = store.values.filter { lobby -> lobby.players.values.any { it.userId == userId } }.map { it.id }
        for (id in targets) {
            lockFor(id).withLock {
                val current = store[id] ?: return@withLock
                // One account is one seat (ADR-0066 (e)); clearing userId re-keys it back to the device session.
                val old = current.players.values.firstOrNull { it.userId == userId } ?: return@withLock
                store[id] = current.rekeyedSeat(old, old.copy(userId = null, pseudonym = anonPseudonym))
                touched += id
            }
        }
        return touched
    }

    // ADR-0049 user.deleted: anonymise seat with fixed replacement pseudonym; mirror of unbindUserSeats.
    override suspend fun anonymizeUserSeats(
        conn: Connection,
        userId: UserId,
        replacementPseudonym: Pseudonym,
    ): Set<LobbyId> {
        val touched = mutableSetOf<LobbyId>()
        val targets = store.values.filter { lobby -> lobby.players.values.any { it.userId == userId } }.map { it.id }
        for (id in targets) {
            lockFor(id).withLock {
                val current = store[id] ?: return@withLock
                val old = current.players.values.firstOrNull { it.userId == userId } ?: return@withLock
                store[id] = current.rekeyedSeat(old, old.copy(userId = null, pseudonym = replacementPseudonym))
                touched += id
            }
        }
        return touched
    }

    // ADR-0049 user.renamed: refresh pseudonym only; no-op rows do not count as touched.
    override suspend fun refreshUserPseudonym(
        conn: Connection,
        userId: UserId,
        newPseudonym: Pseudonym,
    ): Set<LobbyId> {
        val touched = mutableSetOf<LobbyId>()
        val targets =
            store.values
                .filter { lobby -> lobby.players.values.any { it.userId == userId && it.pseudonym != newPseudonym } }
                .map { it.id }
        for (id in targets) {
            lockFor(id).withLock {
                val current = store[id] ?: return@withLock
                if (current.players.values.none { it.userId == userId && it.pseudonym != newPseudonym }) return@withLock
                val newPlayers =
                    current.players.mapValues { (_, player) ->
                        if (player.userId == userId && player.pseudonym != newPseudonym) {
                            player.copy(pseudonym = newPseudonym)
                        } else {
                            player
                        }
                    }
                store[id] = current.copy(players = newPlayers)
                touched += id
            }
        }
        return touched
    }

    // Re-key a seat when its playerId changes (userId stamped/cleared): swap the roster key and re-attribute its locks.
    private fun Lobby.rekeyedSeat(
        old: Player,
        new: Player,
    ): Lobby {
        if (old.playerId == new.playerId) return copy(players = players + (new.playerId to new))
        val nextPlayers = (players - old.playerId) + (new.playerId to new)
        val nextGame =
            game?.let { g ->
                g.copy(lockedPositions = g.lockedPositions.mapValues { (_, pid) -> if (pid == old.playerId) new.playerId else pid })
            }
        return copy(players = nextPlayers, game = nextGame)
    }
}
