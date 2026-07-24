package com.bliss.game.application.ports

import com.bliss.game.domain.GamePuzzle
import com.bliss.game.domain.Letter
import com.bliss.game.domain.Lobby
import com.bliss.game.domain.LobbyCode
import com.bliss.game.domain.LobbyId
import com.bliss.game.domain.LobbyLifecycleState
import com.bliss.game.domain.PlayerId
import com.bliss.game.domain.Position
import com.bliss.game.domain.Pseudonym
import com.bliss.game.domain.SessionId
import com.bliss.game.domain.UserId
import com.bliss.game.domain.analytics.AnalyticsEvent
import java.sql.Connection
import java.time.Instant
import java.util.UUID

/**
 * Atomic lobby state operations. The infrastructure adapter (Wave D) holds a
 * per-lobby [java.util.concurrent.locks.ReentrantLock] under [mutate] so use
 * cases can call it without per-call locking concerns.
 */
interface LobbyRepository {
    suspend fun findById(id: LobbyId): Lobby?

    /**
     * Lookup by the human-friendly join [LobbyCode]. Returns `null` when no
     * lobby carries the code. Powers the Accueil "Rejoindre avec un code"
     * flow + `CreateLobbyUseCase`'s mint-collision check. O(n) in the
     * in-memory v1 — fine while lobby counts are small (ADR-0018 §3); a
     * Postgres adapter can index `code` when it lands.
     */
    suspend fun findByCode(code: LobbyCode): Lobby?

    /**
     * Returns lobbies the given session is currently a member of and that
     * have entered play — IN_PROGRESS or COMPLETED only — ordered by
     * lastActivityAt descending. WAITING (un-started) lobbies are excluded
     * because they are "salons d'attente", not "parties": surfacing them
     * conflates the two and produces 404-toast races when the WAITING TTL
     * elapses between the list fetch and a rejoin click (ADR-0039
     * amendment 2026-05-12). Returns an empty list if the session has no
     * matching lobby. Used by the "Mes parties" surface (ADR-0039).
     */
    suspend fun findBySessionId(sessionId: SessionId): List<Lobby>

    /** Cross-device "Mes parties" (ADR-0066): seats whose userId matches, OR the lobby's owner_user_id (ADR-0066 amendment 2026-07-05, keeps an authed-owned lobby visible after the leave-grace drops the owner seat); same WAITING exclusion + ordering as [findBySessionId]. */
    suspend fun findByUserId(userId: UserId): List<Lobby>

    /**
     * RGPD Article 17 erasure (ADR-0055). Atomic per lobby. Idempotent.
     * Rule 2 vacates an erased owner's lobby to ownerless rather than
     * conscripting the earliest-joined player (ADR-0098 §3).
     */
    suspend fun eraseSession(sessionId: SessionId): EraseSessionResult

    suspend fun save(lobby: Lobby): Lobby

    /**
     * Read-modify-write under a per-lobby lock. Returns the new state, or `null`
     * when no lobby exists for [id] or when the mutator returns `null` (delete signal).
     * A `null` return from the mutator atomically deletes the lobby inside the lock,
     * closing the TOCTOU window between "decide to delete" and "execute delete".
     * The mutator is invoked at most once.
     */
    suspend fun mutate(
        id: LobbyId,
        mutator: (Lobby) -> Lobby?,
    ): Lobby?

    /**
     * Relinquishes ownership (ADR-0098 §2) if [sessionId] still owns the lobby when the per-lobby
     * lock is acquired: drops to ownerless and removes [sessionId]'s seat. A dedicated method, not
     * a raw [mutate] call, because Postgres's upsert deliberately excludes `owner_user_id` from its
     * `ON CONFLICT` update (write-once at create, ADR-0066 amendment 2026-07-05) -- writing this
     * transition through the general save path would silently drop the clear. Default composes
     * [mutate] (correct for the in-memory adapter, which replaces the whole row); the Postgres
     * adapter must override with a purpose-built `owner_user_id` UPDATE that bypasses the upsert.
     */
    suspend fun relinquishOwnership(
        id: LobbyId,
        sessionId: SessionId,
        now: Instant,
    ): RelinquishOutcome {
        var notOwner = false
        // Empties to defunct: mutator returns null to delete, but the outcome still carries the terminal snapshot (ADR-0055/0098).
        var defunct: Lobby? = null
        val updated =
            mutate(id) { lobby ->
                if (!lobby.isCurrentOwner(sessionId)) {
                    notOwner = true
                    lobby
                } else {
                    val next = lobby.relinquishOwner(now).copy(players = lobby.players - PlayerId.of(lobby.ownerUserId, sessionId))
                    if (next.isDefunct()) {
                        defunct = next
                        null
                    } else {
                        next
                    }
                }
            }
        defunct?.let { return RelinquishOutcome.Relinquished(it) }
        updated ?: return RelinquishOutcome.LobbyNotFound
        return if (notOwner) RelinquishOutcome.NotOwner else RelinquishOutcome.Relinquished(updated)
    }

    /**
     * Relinquishes ownership by owner userId (ADR-0098 §2, 2026-07-08 amendment) if [userId] still
     * holds `owner_user_id` when the per-lobby lock is acquired: drops to ownerless and removes the
     * former owner's seat, keyed on the lobby's `owner_session_id`. This is the REST home-screen path,
     * where the caller does not hold the live owner seat, so authorization is by userId, not session.
     * Same dedicated-method rationale as [relinquishOwnership]: Postgres's upsert excludes
     * `owner_user_id`, so the general save path would silently drop the clear. Default composes
     * [mutate] (correct for the in-memory adapter); the Postgres adapter overrides with a purpose-built
     * `owner_user_id` UPDATE guarded `WHERE owner_user_id = ?`.
     */
    suspend fun relinquishOwnershipByUser(
        id: LobbyId,
        userId: UserId,
        now: Instant,
    ): RelinquishOutcome {
        var notOwner = false
        // See relinquishOwnership: an emptied ownerless lobby is deleted but still yields its terminal snapshot.
        var defunct: Lobby? = null
        val updated =
            mutate(id) { lobby ->
                if (lobby.ownerUserId != userId) {
                    notOwner = true
                    lobby
                } else {
                    val next = lobby.relinquishOwner(now).copy(players = lobby.players - PlayerId.of(userId, lobby.ownerSessionId))
                    if (next.isDefunct()) {
                        defunct = next
                        null
                    } else {
                        next
                    }
                }
            }
        defunct?.let { return RelinquishOutcome.Relinquished(it) }
        updated ?: return RelinquishOutcome.LobbyNotFound
        return if (notOwner) RelinquishOutcome.NotOwner else RelinquishOutcome.Relinquished(updated)
    }

    /**
     * Claims an ownerless lobby (ADR-0098 §2) for [sessionId]/[userId] if [sessionId] is still
     * present and the lobby is still ownerless when the per-lobby lock is acquired. Same dedicated-
     * method rationale as [relinquishOwnership]: the general save path silently drops the
     * `owner_user_id` write on Postgres. Default composes [mutate]; the Postgres adapter overrides
     * with a purpose-built `owner_user_id` UPDATE.
     */
    suspend fun claimOwnership(
        id: LobbyId,
        sessionId: SessionId,
        userId: UserId,
        now: Instant,
    ): ClaimOutcome {
        var lockError: ClaimOutcome? = null
        val updated =
            mutate(id) { lobby ->
                when {
                    !lobby.hasJoined(PlayerId.of(userId, sessionId)) -> {
                        lockError = ClaimOutcome.NotPresentInLobby
                        lobby
                    }
                    !lobby.isOwnerless() -> {
                        lockError = ClaimOutcome.AlreadyOwned
                        lobby
                    }
                    else -> lobby.claimOwner(sessionId, userId, now)
                }
            } ?: return ClaimOutcome.LobbyNotFound
        lockError?.let { return it }
        return ClaimOutcome.Claimed(updated)
    }

    suspend fun delete(id: LobbyId)

    /**
     * Returns the WAITING lobby owned by [ownerSessionId] if one exists. Used by
     * `CreateLobbyUseCase` for idempotency: a player who already owns a WAITING
     * lobby gets that lobby back instead of minting a new one. Currently O(n) over
     * the in-memory store — fine for v1 single-replica (ADR-0018 §3); a Postgres
     * adapter can index `(owner_session_id, state)` if/when it lands.
     */
    suspend fun findWaitingByOwnerSession(ownerSessionId: SessionId): Lobby?

    /**
     * Returns the WAITING lobby whose owner seat is held by [userId], if one exists. Backs the
     * ADR-0083 per-user host quota: a free player who already owns a WAITING lobby reopens it
     * instead of minting a second. Keyed on the owner's userId (not sessionId) so the quota
     * survives a new anonymous browser session for the same signed-in user. O(n) in the in-memory
     * v1; the Postgres adapter joins `lobby_players.user_id` on the owner seat.
     */
    suspend fun findWaitingByOwnerUser(userId: UserId): Lobby?

    /**
     * Returns the non-terminal (WAITING or IN_PROGRESS) lobby owned by [userId], if one exists —
     * the sticky-ownership active-game quota key (ADR-0098 §1). Ownership is counted by
     * `owner_user_id`, so a disconnected owner still counts. The default composes the existing
     * owner-keyed lookups; the persistence adapter overrides it with a single
     * `state IN ('WAITING','IN_PROGRESS') AND owner_user_id = ?` query.
     */
    suspend fun findActiveByOwnerUser(userId: UserId): Lobby? =
        findWaitingByOwnerUser(userId)
            ?: findByUserId(userId).firstOrNull {
                it.state == LobbyLifecycleState.IN_PROGRESS && it.ownerUserId == userId
            }

    /**
     * Returns ownerless (`owner_user_id IS NULL`) non-terminal lobbies whose [Lobby.lastActivityAt]
     * is at or before [cutoff] — the ADR-0098 §4 GC sweep for relinquished/RGPD-vacated games.
     * Snapshot — callers must re-validate inside [mutate] (or [delete]) to avoid TOCTOU between the
     * scan and the eviction. Default is empty (the sweep is not yet wired); the adapter overrides it.
     */
    suspend fun findIdleOwnerless(cutoff: Instant): List<Lobby> = emptyList()

    /**
     * Returns WAITING lobbies whose [Lobby.lastActivityAt] is at or before [cutoff].
     * Consumed by the lobby garbage collector to evict abandoned lobbies. Snapshot —
     * callers must re-validate inside [mutate] (or [delete]) to avoid TOCTOU between
     * the scan and the eviction.
     */
    suspend fun findIdleWaiting(cutoff: Instant): List<Lobby>

    /**
     * Returns COMPLETED lobbies whose [Lobby.lastActivityAt] is at or before [cutoff]
     * AND no seat carries a userId — an authed member exempts the whole lobby from
     * eviction (ADR-0055 amendment 2026-07-03; anon-only games keep the 7-day TTL).
     * Snapshot — callers must re-validate inside [mutate] (or [delete]) to avoid
     * TOCTOU between the scan and the eviction.
     */
    suspend fun findIdleCompleted(cutoff: Instant): List<Lobby>

    /**
     * Returns IN_PROGRESS lobbies whose [Lobby.lastActivityAt] is at or before [cutoff] —
     * INACTIVITY, not age. Consumed by the lobby garbage collector to evict abandoned owned
     * in-progress games so a disconnected host does not leave an immortal ghost under sticky
     * ownership (ADR-0055 amendment 2026-07-09, ADR-0066). Snapshot — callers must re-validate
     * inside [mutate] (or [delete]) to avoid TOCTOU between the scan and the eviction.
     */
    suspend fun findIdleInProgress(cutoff: Instant): List<Lobby>

    /** Anon→authed: sets userId + pseudonym on seats where sessionId == anonSessionId AND userId == null. Must be called on a [LobbyWriteCoordinator]-locked [conn]. Idempotent. Returns touched lobby ids. */
    suspend fun rebindAnonSeats(
        conn: Connection,
        anonSessionId: SessionId,
        userId: UserId,
        newPseudonym: Pseudonym,
    ): Set<LobbyId>

    /** Sign-out reversal of rebindAnonSeats: clears userId and reverts pseudonym on all seats for this user. Must be called on a [LobbyWriteCoordinator]-locked [conn]. Idempotent. Returns touched lobby ids. */
    suspend fun unbindUserSeats(
        conn: Connection,
        userId: UserId,
        anonPseudonym: Pseudonym,
    ): Set<LobbyId>

    /** ADR-0049 RGPD Article 17 user deletion: clear userId and replace pseudonym on every matching seat. Must be called on a [LobbyWriteCoordinator]-locked [conn]. Idempotent. Returns touched lobby ids. */
    suspend fun anonymizeUserSeats(
        conn: Connection,
        userId: UserId,
        replacementPseudonym: Pseudonym,
    ): Set<LobbyId>

    /** ADR-0049 user.renamed: refresh pseudonym on every seat for this userId without changing userId. Must be called on a [LobbyWriteCoordinator]-locked [conn]. Idempotent -- unchanged seats not returned. Returns touched lobby ids. */
    suspend fun refreshUserPseudonym(
        conn: Connection,
        userId: UserId,
        newPseudonym: Pseudonym,
    ): Set<LobbyId>
}

/** Outcome of [LobbyRepository.relinquishOwnership]. */
sealed interface RelinquishOutcome {
    data class Relinquished(
        val lobby: Lobby,
    ) : RelinquishOutcome

    data object NotOwner : RelinquishOutcome

    data object LobbyNotFound : RelinquishOutcome
}

/** Outcome of [LobbyRepository.claimOwnership]. */
sealed interface ClaimOutcome {
    data class Claimed(
        val lobby: Lobby,
    ) : ClaimOutcome

    data object NotPresentInLobby : ClaimOutcome

    data object AlreadyOwned : ClaimOutcome

    data object LobbyNotFound : ClaimOutcome
}

/**
 * Fetches a fresh [GamePuzzle] for the lobby owner's chosen dimensions. The
 * HTTP adapter (Wave D) calls grid/'s `GET /v1/puzzles/{id}?width&height`;
 * this layer is unaware of transport.
 */
interface PuzzleProvider {
    suspend fun fetch(
        width: Int,
        height: Int,
    ): GamePuzzle
}

/** Testable time. `SystemClock` lives in infrastructure (Wave D). */
interface Clock {
    fun now(): Instant
}

/** ADR-0049 out-bound port: called with touched lobby ids after anonymizeUserSeats/refreshUserPseudonym to push fresh LobbyState snapshots to live clients. */
interface LobbyRosterBroadcaster {
    suspend fun notifyRosterChanged(lobbyId: LobbyId)
}

/** Out-bound port: closes every live WebSocket session previously bound to [userId], on user.deleted / future session.revoked events. Idempotent; closing an already-closed session is a no-op. */
interface WebSocketRevocationBroadcaster {
    suspend fun disconnectAllForUser(userId: UserId)
}

/**
 * Out-bound port for ephemeral presence events ([LobbyEvent.Typing], [LobbyEvent.Idle],
 * [LobbyEvent.ConnectionLost], [LobbyEvent.CursorBumped]). The infrastructure adapter wires this
 * to `SessionManager.broadcast`; the application layer does not know transport.
 *
 * Why a dedicated port (vs. returning events from a use case as `LobbyUseCases` does): the
 * presence aggregator's edge events fire on internal timer transitions, not in response to a
 * single use-case invocation that has a return value to attach events to. The aggregator pushes
 * directly through this port whenever a threshold is crossed.
 */
interface PresenceBroadcaster {
    suspend fun broadcast(
        lobbyId: LobbyId,
        event: LobbyEvent,
    )
}

/**
 * Out-bound port for product analytics events ([AnalyticsEvent] subtypes). Adapters
 * (Matomo in production, Noop in dev/tests) live in `:game:infrastructure`.
 *
 * Implementations MUST be fire-and-forget: a call to [record] never blocks the
 * caller, never propagates a failure, and never throws. If the analytics backend
 * is unreachable or returns an error, the implementation logs and drops the event.
 *
 * `sessionId` is optional. When present, the adapter computes a daily-rotated
 * salted hash (ADR-0025 §3) so the visitor is identifiable within a day but not
 * across days. The raw `SessionId` is never sent to the analytics backend.
 */
interface AnalyticsEventSink {
    /**
     * Non-blocking by contract — implementations launch the work into their own
     * supervised scope and return immediately. Callers may invoke from synchronous
     * or coroutine code; never throws, never propagates failure.
     */
    fun record(
        event: AnalyticsEvent,
        sessionId: SessionId? = null,
    )

    companion object {
        /**
         * In-process no-op sink. Use as a default for use-case constructors so existing
         * tests continue to compile without Matomo wiring, and as the production fallback
         * when Matomo env vars are not configured.
         */
        val Noop: AnalyticsEventSink =
            object : AnalyticsEventSink {
                override fun record(
                    event: AnalyticsEvent,
                    sessionId: SessionId?,
                ) = Unit
            }
    }
}

/**
 * Asks grid whether every currently-filled cell of a word matches the canonical solution.
 *
 * Per the v1 wire spec (grid/api/openapi.yaml `LetterCell`), grid strips
 * letter answers from `GET /v1/puzzles/{id}` so the browser can never see
 * the solution and cheat. game-api therefore can't validate locally —
 * `LetterCell.answer` is null on every cell of every puzzle it ever
 * receives. To know whether a player just completed a word, `UpdateCellUseCase`
 * delegates to this port (HTTP adapter calls grid's internal, service-
 * authenticated `POST /v1/puzzles/{id}/validate-word`, ADR-0084).
 *
 * Returns true iff every submitted cell of the word matches the canonical
 * solution. The endpoint is a per-word binary oracle carrying no positional
 * data (ADR-0084 §1) — it never says *which* cell is wrong.
 */
interface WordValidator {
    suspend fun isWordCorrect(
        puzzleId: UUID,
        word: Map<Position, Letter>,
    ): Boolean
}

/**
 * Aggregated counts returned by [LobbyRepository.eraseSession]. Each field maps
 * to one ADR-0039 cascade rule; the sum is what `DELETE /v1/sessions/{sessionId}`
 * surfaces on the wire.
 */
data class EraseSessionResult(
    val deletedLobbies: Int,
    // Rule 2 now vacates ownership to ownerless rather than transferring it (ADR-0098 §3 amends ADR-0055).
    val vacatedLobbies: Int,
    val removedPlayerships: Int,
    val anonymisedEntries: Int,
) {
    companion object {
        val Empty = EraseSessionResult(0, 0, 0, 0)
    }
}
