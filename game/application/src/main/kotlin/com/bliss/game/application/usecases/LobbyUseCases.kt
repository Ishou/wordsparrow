package com.bliss.game.application.usecases

import com.bliss.game.application.ports.AnalyticsEventSink
import com.bliss.game.application.ports.ClaimOutcome
import com.bliss.game.application.ports.Clock
import com.bliss.game.application.ports.LobbyEvent
import com.bliss.game.application.ports.LobbyRepository
import com.bliss.game.application.ports.PuzzleProvider
import com.bliss.game.application.ports.RelinquishOutcome
import com.bliss.game.application.ports.WordValidator
import com.bliss.game.domain.CellEntry
import com.bliss.game.domain.GameSession
import com.bliss.game.domain.GridConfig
import com.bliss.game.domain.Letter
import com.bliss.game.domain.Lobby
import com.bliss.game.domain.LobbyCode
import com.bliss.game.domain.LobbyId
import com.bliss.game.domain.LobbyLifecycleState
import com.bliss.game.domain.Player
import com.bliss.game.domain.Position
import com.bliss.game.domain.Pseudonym
import com.bliss.game.domain.SessionId
import com.bliss.game.domain.UserId
import com.bliss.game.domain.analytics.AnalyticsEvent
import com.bliss.game.domain.wordsContaining
import kotlinx.coroutines.CancellationException
import org.slf4j.Logger
import org.slf4j.LoggerFactory
import java.time.Duration
import java.time.Instant

private fun GridConfig.toLabel(): String = "${width}x$height"

/**
 * Shared collision-bounded `LobbyCode` minter — used by
 * [CreateLobbyUseCase] and [RotateLobbyCodeUseCase]. 32^6 keyspace makes
 * collisions vanishingly unlikely; the bounded retry fails loudly on a
 * future volume regression instead of returning a duplicate code. Same
 * TOCTOU caveat as elsewhere — Postgres `UNIQUE (code)` will tighten it.
 */
private const val MAX_CODE_MINT_ATTEMPTS = 8

private suspend fun mintUniqueCode(repo: LobbyRepository): LobbyCode {
    repeat(MAX_CODE_MINT_ATTEMPTS) {
        val candidate = LobbyCode.generate()
        if (repo.findByCode(candidate) == null) return candidate
    }
    error(
        "LobbyCode mint exhausted $MAX_CODE_MINT_ATTEMPTS attempts - keyspace saturation or a generator bug; investigate before retrying.",
    )
}

/**
 * Bootstraps a new lobby in WAITING with the calling player as owner. Active-game quota by tier
 * (ADR-0083 + ADR-0098 §1): [ownerUserId]'s existing active (WAITING or IN_PROGRESS) owned game is
 * reopened unless [hostUnlimited]; race-freedom depends on the api edge calling this inside
 * `withUserLock(ownerUserId)`.
 */
class CreateLobbyUseCase(
    private val repo: LobbyRepository,
    private val clock: Clock,
    private val defaultGridConfig: GridConfig = GridConfig(28, 20),
    private val analyticsEventSink: AnalyticsEventSink = AnalyticsEventSink.Noop,
) {
    suspend operator fun invoke(
        ownerSessionId: SessionId,
        ownerPseudonym: Pseudonym,
        ownerUserId: UserId? = null,
        hostUnlimited: Boolean = false,
    ): UseCaseResult<Lobby> {
        // Per-user "1 active game" quota; safe against concurrent double-create only under the route's withUserLock(ownerUserId) (ADR-0083, ADR-0098 §1).
        if (!hostUnlimited && ownerUserId != null) {
            repo.findActiveByOwnerUser(ownerUserId)?.let { existing ->
                return UseCaseResult(existing, emptyList())
            }
        }
        val now = clock.now()
        val owner = Player(ownerSessionId, ownerPseudonym, now, userId = ownerUserId)
        val code = mintUniqueCode(repo)
        val lobby =
            Lobby(
                id = LobbyId.generate(),
                ownerSessionId = ownerSessionId,
                players = mapOf(ownerSessionId to owner),
                state = LobbyLifecycleState.WAITING,
                gridConfig = defaultGridConfig,
                game = null,
                lastActivityAt = now,
                code = code,
                ownerUserId = ownerUserId,
            )
        val saved = repo.save(lobby)
        analyticsEventSink.record(AnalyticsEvent.LobbyCreated(saved.gridConfig.toLabel()), ownerSessionId)
        return UseCaseResult(saved, listOf(LobbyEvent.PlayerJoined(owner)))
    }
}

/**
 * Owner-only: re-mint the lobby's [LobbyCode] in place (ADR-0029).
 * Membership and game state are unchanged; reconnects key on
 * `sessionId` so already-joined players keep their seats. Owner check
 * is re-verified inside the mutator (canonical TOCTOU posture) — a
 * concurrent ownership transfer is absorbed by leaving the lobby
 * unchanged.
 */
class RotateLobbyCodeUseCase(
    private val repo: LobbyRepository,
    private val clock: Clock,
    private val analyticsEventSink: AnalyticsEventSink = AnalyticsEventSink.Noop,
) {
    suspend operator fun invoke(
        lobbyId: LobbyId,
        sessionId: SessionId,
    ): UseCaseOutcome<Lobby> {
        val current = repo.findById(lobbyId) ?: return failure(UseCaseError.LobbyNotFound)
        if (!current.isCurrentOwner(sessionId)) return failure(UseCaseError.NotOwner)
        val newCode = mintUniqueCode(repo)
        var rotated = false
        val updated =
            repo.mutate(lobbyId) { lobby ->
                if (!lobby.isCurrentOwner(sessionId)) return@mutate lobby
                rotated = true
                lobby.copy(code = newCode, lastActivityAt = clock.now())
            } ?: return failure(UseCaseError.LobbyNotFound)
        if (!rotated) return failure(UseCaseError.NotOwner)
        analyticsEventSink.record(AnalyticsEvent.LobbyCodeRotated, sessionId)
        return success(updated, listOf(LobbyEvent.CodeRotated(newCode)))
    }
}

/** Idempotent join — reconnects, owner/member rejoins (ADR-0066 (b)), and owner re-entries bypass the code check; outsiders need a valid code. */
class JoinLobbyUseCase(
    private val repo: LobbyRepository,
    private val clock: Clock,
    private val analyticsEventSink: AnalyticsEventSink = AnalyticsEventSink.Noop,
) {
    suspend operator fun invoke(
        lobbyId: LobbyId,
        sessionId: SessionId,
        pseudonym: Pseudonym,
        code: String?,
        userId: UserId? = null,
    ): UseCaseOutcome<Lobby> {
        var emitted: LobbyEvent? = null
        var wrongCode = false

        // Capacity-guarded seat: no-op when full so the outer LobbyFull check fires; may rebind ownership to the caller.
        fun seat(
            lobby: Lobby,
            seatUserId: UserId?,
            rebindOwner: Boolean,
        ): Lobby {
            // Moves the seat rather than duplicating it: an authed rejoin from a new device replaces any stale seat for the same userId (ADR-0066 (b)).
            val withoutStaleSeat =
                if (seatUserId != null) {
                    lobby.players.filterValues { it.userId != seatUserId }
                } else {
                    lobby.players
                }
            // Gate capacity on the post-removal count so replacing your own stale seat is a net-zero swap, not a rejected join.
            if (withoutStaleSeat.size >= Lobby.MAX_PLAYERS) return lobby
            val now = clock.now()
            val player = Player(sessionId, pseudonym, now, userId = seatUserId)
            emitted = LobbyEvent.PlayerJoined(player)
            return lobby.copy(
                ownerSessionId = if (rebindOwner) sessionId else lobby.ownerSessionId,
                players = withoutStaleSeat + (sessionId to player),
                lastActivityAt = now,
            )
        }

        val updated =
            repo.mutate(lobbyId) { lobby ->
                when {
                    // Reconnect path: bump lastActivityAt so an idle re-open keeps the lobby alive.
                    // Code is intentionally NOT checked here — see ADR-0027.
                    lobby.hasJoined(sessionId) -> lobby.touched(clock.now())
                    // Owner re-entry bypass (ADR-0039): auth by ownerSessionId match, same posture as reconnect.
                    lobby.isOwner(sessionId) -> seat(lobby, seatUserId = null, rebindOwner = false)
                    // Authed owner rejoin (ADR-0066 (b)): rebind ownerSessionId to the returning device — same-principal exception to ADR-0055 §f.
                    userId != null && userId == lobby.ownerUserId -> seat(lobby, seatUserId = userId, rebindOwner = true)
                    // Authed member rejoin (ADR-0066 (b)): a seat already carries this verified userId.
                    userId != null && lobby.players.values.any { it.userId == userId } ->
                        seat(lobby, seatUserId = userId, rebindOwner = false)
                    code != lobby.code.value -> {
                        wrongCode = true
                        lobby
                    }
                    // Stamp the server-verified userId onto a fresh authed join so findByUserId surfaces the game cross-device and after relinquish (ADR-0066 (c)); anon joins pass null.
                    else -> seat(lobby, seatUserId = userId, rebindOwner = false)
                }
            } ?: return failure(UseCaseError.LobbyNotFound)
        if (wrongCode) return failure(UseCaseError.WrongCode)
        if (updated.isFull() && !updated.hasJoined(sessionId)) return failure(UseCaseError.LobbyFull)
        if (emitted != null) {
            analyticsEventSink.record(AnalyticsEvent.LobbyJoined(updated.players.size), sessionId)
        }
        return success(updated, listOfNotNull(emitted))
    }
}

/** Updates the caller's pseudonym; player must already be in the lobby. */
class RenameSelfUseCase(
    private val repo: LobbyRepository,
    private val clock: Clock,
    private val analyticsEventSink: AnalyticsEventSink = AnalyticsEventSink.Noop,
) {
    suspend operator fun invoke(
        lobbyId: LobbyId,
        sessionId: SessionId,
        newPseudonym: Pseudonym,
    ): UseCaseOutcome<Lobby> {
        val before = repo.findById(lobbyId) ?: return failure(UseCaseError.LobbyNotFound)
        if (!before.hasJoined(sessionId)) return failure(UseCaseError.PlayerNotInLobby)
        var renamed = false
        val updated =
            repo.mutate(lobbyId) { lobby ->
                val existing = lobby.players[sessionId] ?: return@mutate lobby
                renamed = true
                lobby.copy(
                    players = lobby.players + (sessionId to existing.copy(pseudonym = newPseudonym)),
                    lastActivityAt = clock.now(),
                )
            } ?: return failure(UseCaseError.LobbyNotFound)
        // Player left between findById and mutate; mutator no-oped silently.
        if (!renamed) return failure(UseCaseError.PlayerNotInLobby)
        analyticsEventSink.record(AnalyticsEvent.PlayerRenamed, sessionId)
        return success(updated, listOf(LobbyEvent.PlayerRenamed(sessionId, newPseudonym)))
    }
}

/** Owner-only, WAITING-only: change the grid dimensions before Start. */
class SetGridConfigUseCase(
    private val repo: LobbyRepository,
    private val clock: Clock,
) {
    suspend operator fun invoke(
        lobbyId: LobbyId,
        sessionId: SessionId,
        config: GridConfig,
    ): UseCaseOutcome<Lobby> {
        val current = repo.findById(lobbyId) ?: return failure(UseCaseError.LobbyNotFound)
        if (!current.isCurrentOwner(sessionId)) return failure(UseCaseError.NotOwner)
        if (current.state != LobbyLifecycleState.WAITING) return failure(UseCaseError.InvalidState)
        var changed = false
        val updated =
            repo.mutate(lobbyId) { lobby ->
                // Re-verify inside the lock: a concurrent startGame may have transitioned the lobby.
                if (!lobby.isCurrentOwner(sessionId) || lobby.state != LobbyLifecycleState.WAITING) return@mutate lobby
                changed = true
                lobby.copy(gridConfig = config, lastActivityAt = clock.now())
            } ?: return failure(UseCaseError.LobbyNotFound)
        if (!changed) {
            return if (!updated.isCurrentOwner(sessionId)) failure(UseCaseError.NotOwner) else failure(UseCaseError.InvalidState)
        }
        return success(updated, listOf(LobbyEvent.GridConfigChanged(config)))
    }
}

/** Owner-only: fetch a puzzle for the current grid size and transition to IN_PROGRESS. */
class StartGameUseCase(
    private val repo: LobbyRepository,
    private val puzzleProvider: PuzzleProvider,
    private val clock: Clock,
    private val analyticsEventSink: AnalyticsEventSink = AnalyticsEventSink.Noop,
) {
    suspend operator fun invoke(
        lobbyId: LobbyId,
        sessionId: SessionId,
    ): UseCaseOutcome<Lobby> {
        val current = repo.findById(lobbyId) ?: return failure(UseCaseError.LobbyNotFound)
        if (!current.isCurrentOwner(sessionId)) return failure(UseCaseError.NotOwner)
        if (current.state != LobbyLifecycleState.WAITING) return failure(UseCaseError.InvalidState)
        // Fetch outside the lock — IO must not stall other lobbies' mutators.
        val puzzle = puzzleProvider.fetch(current.gridConfig.width, current.gridConfig.height)
        // Session is created inside the mutator so startedAt is stamped under the lock and a
        // concurrent double-tap cannot overwrite a live session with a second one.
        var session: GameSession? = null
        val updated =
            repo.mutate(lobbyId) { lobby ->
                if (!lobby.isCurrentOwner(sessionId) || lobby.state != LobbyLifecycleState.WAITING) return@mutate lobby
                val now = clock.now()
                val s = GameSession(puzzle, emptyMap(), now, null)
                session = s
                lobby.copy(state = LobbyLifecycleState.IN_PROGRESS, game = s, lastActivityAt = now)
            } ?: return failure(UseCaseError.LobbyNotFound)
        val started = session ?: return failure(UseCaseError.InvalidState)
        analyticsEventSink.record(
            AnalyticsEvent.GameStarted(updated.gridConfig.toLabel(), updated.players.size),
            sessionId,
        )
        return success(updated, listOf(LobbyEvent.GameStarted(started)))
    }
}

/** Owner-only: from COMPLETED, start a fresh game reusing the lobby's gridConfig (ADR-0113). */
class RematchUseCase(
    private val repo: LobbyRepository,
    private val puzzleProvider: PuzzleProvider,
    private val clock: Clock,
    private val analyticsEventSink: AnalyticsEventSink = AnalyticsEventSink.Noop,
) {
    suspend operator fun invoke(
        lobbyId: LobbyId,
        sessionId: SessionId,
        expectedCompletedAt: Instant? = null,
    ): UseCaseOutcome<Lobby> {
        val current = repo.findById(lobbyId) ?: return failure(UseCaseError.LobbyNotFound)
        if (!current.isCurrentOwner(sessionId)) return failure(UseCaseError.NotOwner)
        if (current.state != LobbyLifecycleState.COMPLETED) return failure(UseCaseError.InvalidState)
        // Fetch outside the lock — IO must not stall other lobbies' mutators.
        val puzzle = puzzleProvider.fetch(current.gridConfig.width, current.gridConfig.height)
        var session: GameSession? = null
        val updated =
            repo.mutate(lobbyId) { lobby ->
                if (!lobby.isCurrentOwner(sessionId) || lobby.state != LobbyLifecycleState.COMPLETED) return@mutate lobby
                // Staleness guard (ADR-0113): a timer from a prior game must not restart a newer one.
                if (expectedCompletedAt != null && lobby.game?.completedAt != expectedCompletedAt) return@mutate lobby
                val now = clock.now()
                val s = GameSession(puzzle, emptyMap(), now, null)
                session = s
                lobby.copy(state = LobbyLifecycleState.IN_PROGRESS, game = s, lastActivityAt = now)
            } ?: return failure(UseCaseError.LobbyNotFound)
        // session stays null when a guard short-circuited the mutator (not owner / not COMPLETED / stale).
        val started = session ?: return failure(UseCaseError.InvalidState)
        analyticsEventSink.record(
            AnalyticsEvent.GameStarted(updated.gridConfig.toLabel(), updated.players.size),
            sessionId,
        )
        return success(updated, listOf(LobbyEvent.GameStarted(started)))
    }
}

/** Owner-only: return a COMPLETED lobby to WAITING to pick a new grid (ADR-0113). */
class ReturnToSalonUseCase(
    private val repo: LobbyRepository,
    private val clock: Clock,
    private val analyticsEventSink: AnalyticsEventSink = AnalyticsEventSink.Noop,
) {
    suspend operator fun invoke(
        lobbyId: LobbyId,
        sessionId: SessionId,
    ): UseCaseOutcome<Lobby> {
        val current = repo.findById(lobbyId) ?: return failure(UseCaseError.LobbyNotFound)
        if (!current.isCurrentOwner(sessionId)) return failure(UseCaseError.NotOwner)
        if (current.state != LobbyLifecycleState.COMPLETED) return failure(UseCaseError.InvalidState)
        var returned = false
        val updated =
            repo.mutate(lobbyId) { lobby ->
                if (!lobby.isCurrentOwner(sessionId) || lobby.state != LobbyLifecycleState.COMPLETED) return@mutate lobby
                returned = true
                lobby.copy(state = LobbyLifecycleState.WAITING, game = null, lastActivityAt = clock.now())
            } ?: return failure(UseCaseError.LobbyNotFound)
        if (!returned) {
            return if (!updated.isCurrentOwner(sessionId)) failure(UseCaseError.NotOwner) else failure(UseCaseError.InvalidState)
        }
        return success(updated, listOf(LobbyEvent.ReturnedToSalon))
    }
}

/**
 * Removes a player from a lobby. Does NOT transfer ownership when the
 * owner leaves — the owner is expected to return via My-games
 * (ADR-0039). An owned lobby persists when emptied, cleaned up by
 * [LobbyGarbageCollector]'s state-specific TTL; an already-ownerless
 * lobby emptied by the last player leaving is destroyed immediately
 * instead (ADR-0055/0098).
 *
 * Manual ownership transfer is intentionally out of scope. The only
 * code path that transfers ownership is RGPD erasure (see ADR-0039 §f
 * and EraseSessionUseCase), where the user is gone permanently and
 * leaving a "dead owner" would lock the rest out of owner-gated
 * actions.
 *
 * If an owner clears localStorage without erasing, owner-only actions
 * (start, kick) become unavailable until they rejoin; non-owner play
 * continues. Acceptable until OAuth.
 */
class LeaveLobbyUseCase(
    private val repo: LobbyRepository,
    private val clock: Clock,
    private val analyticsEventSink: AnalyticsEventSink = AnalyticsEventSink.Noop,
) {
    suspend operator fun invoke(
        lobbyId: LobbyId,
        sessionId: SessionId,
    ): UseCaseOutcome<Lobby?> {
        val events = mutableListOf<LobbyEvent>(LobbyEvent.PlayerLeft(sessionId))
        var playerWasPresent = false
        var destroyed = false
        val updated =
            repo.mutate(lobbyId) { lobby ->
                if (!lobby.hasJoined(sessionId)) return@mutate lobby
                playerWasPresent = true
                // Keep ownerSessionId unchanged; an owned lobby persists when emptied (owner returns via My-games).
                val next = lobby.copy(players = lobby.players - sessionId, lastActivityAt = clock.now())
                // ADR-0055/0098: the last player leaving an ownerless lobby leaves a ghost -- delete it now.
                if (next.isDefunct()) {
                    destroyed = true
                    null
                } else {
                    next
                }
            }
        // destroyed => Success(null); else updated == null unambiguously means "lobby does not exist".
        if (destroyed) {
            analyticsEventSink.record(AnalyticsEvent.LobbyLeft, sessionId)
            return success(null, events)
        }
        if (updated == null) return failure(UseCaseError.LobbyNotFound)
        if (!playerWasPresent) return failure(UseCaseError.PlayerNotInLobby)
        analyticsEventSink.record(AnalyticsEvent.LobbyLeft, sessionId)
        return success(updated, events)
    }
}

/**
 * Explicit relinquish (ADR-0098 §2): the current owner gives up the game, which becomes ownerless,
 * and their own seat is dropped. Only the owner may relinquish — the disconnect grace path (a plain
 * [LeaveLobbyUseCase]) never touches ownership. Owner check is re-verified inside
 * [LobbyRepository.relinquishOwnership]'s lock, not here.
 */
class RelinquishOwnershipUseCase(
    private val repo: LobbyRepository,
    private val clock: Clock,
) {
    suspend operator fun invoke(
        lobbyId: LobbyId,
        sessionId: SessionId,
    ): UseCaseOutcome<Lobby?> {
        val current = repo.findById(lobbyId) ?: return failure(UseCaseError.LobbyNotFound)
        if (!current.isCurrentOwner(sessionId)) return failure(UseCaseError.NotOwner)
        return when (val outcome = repo.relinquishOwnership(lobbyId, sessionId, clock.now())) {
            is RelinquishOutcome.Relinquished -> success(outcome.lobby, listOf(LobbyEvent.PlayerLeft(sessionId)))
            RelinquishOutcome.NotOwner -> failure(UseCaseError.NotOwner)
            RelinquishOutcome.LobbyNotFound -> failure(UseCaseError.LobbyNotFound)
        }
    }
}

/**
 * Relinquish by owner userId (ADR-0098 §2, 2026-07-08 amendment): the REST `DELETE .../ownership`
 * path. The home-screen caller does not hold the live owner seat, so authorization is on
 * [Lobby.ownerUserId] (the sticky owner), not on `ownerSessionId`. An already-ownerless lobby has a
 * null ownerUserId and so fails the owner check -> NotOwner, making relinquish idempotently
 * rejected. Owner check is re-verified inside [LobbyRepository.relinquishOwnershipByUser]'s lock.
 */
class RelinquishOwnershipByUserUseCase(
    private val repo: LobbyRepository,
    private val clock: Clock,
) {
    suspend operator fun invoke(
        lobbyId: LobbyId,
        userId: UserId,
    ): UseCaseOutcome<Lobby> {
        val current = repo.findById(lobbyId) ?: return failure(UseCaseError.LobbyNotFound)
        if (current.ownerUserId != userId) return failure(UseCaseError.NotOwner)
        return when (val outcome = repo.relinquishOwnershipByUser(lobbyId, userId, clock.now())) {
            is RelinquishOutcome.Relinquished ->
                success(outcome.lobby, listOf(LobbyEvent.PlayerLeft(current.ownerSessionId)))
            RelinquishOutcome.NotOwner -> failure(UseCaseError.NotOwner)
            RelinquishOutcome.LobbyNotFound -> failure(UseCaseError.LobbyNotFound)
        }
    }
}

/**
 * REST leave/delete-a-game-from-a-list (ADR-0098 amendment 2026-07-08): the caller drops their seat,
 * and if they are the current owner ownership is relinquished too. Composed from the shipped
 * [RelinquishOwnershipByUserUseCase] (owner path) and [LeaveLobbyUseCase] (non-owner path); with the
 * ADR-0055 destroy-ownerless-and-empty rule this yields delete-if-alone / leave-if-others for owner
 * and non-owner callers alike. Ownership is checked first: an owner may relinquish/delete their game
 * whether or not they still hold a seat (ownership is sticky across disconnect, ADR-0066, so a hosted
 * game shows in "Mes parties" after the owner's seat is dropped). A non-owner is resolved by verified
 * userId and gets [UseCaseError.NotPresentInLobby] when unseated (guests are 401'd at the route per
 * ADR-0060's 2026-06-29 amendment).
 */
class LeaveMembershipUseCase(
    private val repo: LobbyRepository,
    private val leaveLobby: LeaveLobbyUseCase,
    private val relinquishByUser: RelinquishOwnershipByUserUseCase,
) {
    suspend operator fun invoke(
        lobbyId: LobbyId,
        userId: UserId,
    ): UseCaseOutcome<MembershipLeaveResult> {
        val current = repo.findById(lobbyId) ?: return failure(UseCaseError.LobbyNotFound)
        return if (current.ownerUserId == userId) {
            when (val outcome = relinquishByUser(lobbyId, userId)) {
                is UseCaseOutcome.Success ->
                    success(MembershipLeaveResult(outcome.result.value, relinquishedOwnership = true), outcome.result.events)
                is UseCaseOutcome.Failure -> outcome
            }
        } else {
            val seat =
                current.players.values.firstOrNull { it.userId == userId }
                    ?: return failure(UseCaseError.NotPresentInLobby)
            when (val outcome = leaveLobby(lobbyId, seat.sessionId)) {
                is UseCaseOutcome.Success ->
                    success(MembershipLeaveResult(outcome.result.value, relinquishedOwnership = false), outcome.result.events)
                is UseCaseOutcome.Failure -> outcome
            }
        }
    }
}

/** Surviving lobby (null if destroyed) plus whether the caller's departure relinquished ownership -- drives the peer ownershipChanged broadcast. */
data class MembershipLeaveResult(
    val lobby: Lobby?,
    val relinquishedOwnership: Boolean,
)

/**
 * Claim an ownerless game (ADR-0098 §2): a player present in a non-terminal, ownerless lobby takes
 * ownership, quota-gated (ADR-0098 §1/§5) unless [hostUnlimited]. Presence and ownerless-ness are
 * re-verified inside [LobbyRepository.claimOwnership]'s lock; the quota re-check runs under the api
 * edge's `withUserLock(userId)` (it cannot enter the non-suspend mutator) so two claimers cannot both
 * win.
 */
class ClaimLobbyOwnershipUseCase(
    private val repo: LobbyRepository,
    private val clock: Clock,
) {
    suspend operator fun invoke(
        lobbyId: LobbyId,
        sessionId: SessionId,
        userId: UserId,
        hostUnlimited: Boolean = false,
    ): UseCaseOutcome<Lobby> {
        val current = repo.findById(lobbyId) ?: return failure(UseCaseError.LobbyNotFound)
        if (!current.hasJoined(sessionId)) return failure(UseCaseError.NotPresentInLobby)
        if (!current.isOwnerless()) return failure(UseCaseError.AlreadyOwned)
        if (!hostUnlimited && repo.findActiveByOwnerUser(userId) != null) return failure(UseCaseError.QuotaExceeded)
        return when (val outcome = repo.claimOwnership(lobbyId, sessionId, userId, clock.now())) {
            is ClaimOutcome.Claimed -> success(outcome.lobby, emptyList())
            ClaimOutcome.NotPresentInLobby -> failure(UseCaseError.NotPresentInLobby)
            ClaimOutcome.AlreadyOwned -> failure(UseCaseError.AlreadyOwned)
            ClaimOutcome.LobbyNotFound -> failure(UseCaseError.LobbyNotFound)
        }
    }
}

/**
 * Records a single cell write under last-write-wins (ADR-0018 §"Conflict policy"). When the new
 * write transitions the puzzle to fully solved, the lobby moves to COMPLETED and a [LobbyEvent.GameSolved]
 * event is appended. Lobby must be IN_PROGRESS and the player must be a member.
 *
 * Word lock detection: per the v1 wire (grid/api/openapi.yaml `LetterCell`),
 * the canonical letter is stripped from `GET /v1/puzzles/{id}` so the
 * client (and game-api) never see the solution. To know whether a fill
 * just completed a correct word, this use case delegates to
 * [WordValidator] (HTTP adapter calls grid's per-word
 * `POST /validate-word`, ADR-0084). The validator is queried OUTSIDE the
 * per-lobby mutator so the lock is not held across an HTTP call.
 */
class UpdateCellUseCase(
    private val repo: LobbyRepository,
    private val clock: Clock,
    private val wordValidator: WordValidator,
    private val analyticsEventSink: AnalyticsEventSink = AnalyticsEventSink.Noop,
    private val log: Logger = LoggerFactory.getLogger(UpdateCellUseCase::class.java),
) {
    suspend operator fun invoke(
        lobbyId: LobbyId,
        sessionId: SessionId,
        position: Position,
        letter: Letter?,
    ): UseCaseOutcome<Lobby> {
        // Step 1: write the cell entry; locked cells short-circuit. Completion is decided in step 3 once the winning word locks.
        var writtenAt: Instant? = null
        var entriesAfter: Map<Position, CellEntry> = emptyMap()
        var solved: Pair<Long, Map<Position, CellEntry>>? = null
        val updated =
            repo.mutate(lobbyId) { lobby ->
                if (lobby.state != LobbyLifecycleState.IN_PROGRESS) return@mutate lobby
                if (!lobby.hasJoined(sessionId)) return@mutate lobby
                val session = lobby.game ?: return@mutate lobby
                // Locked cells silently ignore writes — no event, no broadcast, no lastActivityAt
                // bump (so peers' idle timers do not reset on attempts to overwrite a sage cell).
                if (position in session.lockedPositions) return@mutate lobby
                val now = clock.now().also { writtenAt = it }
                val entries =
                    if (letter == null) {
                        session.entries - position
                    } else {
                        session.entries + (position to CellEntry(sessionId, letter, now))
                    }
                entriesAfter = entries
                lobby.copy(game = session.copy(entries = entries), lastActivityAt = now)
            } ?: return failure(UseCaseError.LobbyNotFound)
        // writtenAt is null when the mutator short-circuited (player not in lobby, not IN_PROGRESS,
        // or position already locked). The locked-no-op case must surface as success-with-no-events.
        val stamp = writtenAt ?: return passthroughOrFailure(updated, sessionId)

        val events = mutableListOf<LobbyEvent>(LobbyEvent.CellUpdated(sessionId, position, letter, stamp))

        // Step 2: only ask grid about the words that contain the just-written
        // position. If none of them are fully filled, skip the HTTP call.
        val session = updated.game ?: return success(updated, events).withSolved(solved)
        val candidateWords = candidateWordsToCheck(session, position, entriesAfter)
        if (candidateWords.isEmpty() || letter == null) {
            return success(updated, events).withSolved(solved)
        }

        // Validator failure is non-fatal (cell already committed) but logged so a total lock outage is never silent (ADR-0084).
        // newLocks holds only freshly-transitioned positions — words crossing an already-locked word reuse cells already known client-side.
        // A validator exception is non-fatal and yields neither a lock nor a reject (continue).
        val newLocks = mutableSetOf<Position>()
        val rejectedPositions = mutableSetOf<Position>()
        for (word in candidateWords) {
            val correct =
                try {
                    wordValidator.isWordCorrect(session.puzzle.id, lettersOf(word, entriesAfter))
                } catch (cause: CancellationException) {
                    throw cause
                } catch (cause: Exception) {
                    log.warn(
                        "coop.word_validate_failed lobbyId={} puzzleId={} position={} cause={}",
                        lobbyId.value,
                        session.puzzle.id,
                        position,
                        cause.message,
                        cause,
                    )
                    continue
                }
            if (correct) {
                newLocks += word.filter { it !in session.lockedPositions }
            } else {
                rejectedPositions += word.filter { it !in session.lockedPositions }
            }
        }
        // ADR-0085: broadcast wrong-completion cells so clients shake synchronously, mirror of WordLocked.
        if (rejectedPositions.isNotEmpty()) events += LobbyEvent.WordRejected(rejectedPositions, stamp)
        if (newLocks.isEmpty()) return success(updated, events).withSolved(solved)

        // Step 3: re-enter the mutator to commit the locks. Filter to positions
        // whose live letter still matches what was validated — a concurrent
        // UpdateCellUseCase may have written a different letter between step 1
        // and here. That write was already broadcast via cellUpdated, so locking
        // a position with a stale letter would show peers a sage cell with the
        // wrong letter. Leaving it unlocked lets the correct-letter player
        // retype to retrigger the lock.
        var actualLocks = emptySet<Position>()
        repo.mutate(lobbyId) { lobby ->
            val s = lobby.game ?: return@mutate lobby
            // First-writer-wins (ADR-0086): re-filter against the live lock map so a
            // position a crossing word locked between step 1 and here keeps its owner.
            val stillCorrect =
                newLocks
                    .filter { pos ->
                        pos !in s.lockedPositions && s.entries[pos]?.letter == entriesAfter[pos]?.letter
                    }.toSet()
            if (stillCorrect.isEmpty()) return@mutate lobby
            actualLocks = stillCorrect
            val locked = s.copy(lockedPositions = s.lockedPositions + stillCorrect.associateWith { sessionId })
            // Completion (ADR-0084): checked on locks, not the raw cell write — the winning lock tips the grid to solved.
            if (locked.isSolved() && s.completedAt == null) {
                solved = Duration.between(s.startedAt, stamp).toMillis() to s.entries
                lobby.copy(
                    state = LobbyLifecycleState.COMPLETED,
                    game = locked.copy(completedAt = stamp),
                    lastActivityAt = stamp,
                )
            } else {
                lobby.copy(game = locked, lastActivityAt = stamp)
            }
        }
        if (actualLocks.isEmpty()) return success(updated, events).withSolved(solved)
        events += LobbyEvent.WordLocked(actualLocks, sessionId, stamp)
        val finalLobby = repo.findById(lobbyId) ?: updated
        val solvedResult = solved
        if (solvedResult != null) {
            analyticsEventSink.record(
                AnalyticsEvent.GameSolved(
                    gridSize = finalLobby.gridConfig.toLabel(),
                    playerCount = finalLobby.players.size,
                    durationMs = solvedResult.first,
                ),
                sessionId,
            )
        }
        return success(finalLobby, events).withSolved(solved)
    }

    private fun UseCaseOutcome<Lobby>.withSolved(solved: Pair<Long, Map<Position, CellEntry>>?): UseCaseOutcome<Lobby> =
        if (solved == null) {
            this
        } else {
            when (this) {
                is UseCaseOutcome.Success ->
                    success(
                        result.value,
                        result.events + LobbyEvent.GameSolved(solved.first, solved.second),
                    )
                is UseCaseOutcome.Failure -> this
            }
        }

    /**
     * Returns the words containing [justWritten] that are now fully filled and not yet
     * locked. We only ask the validator about these — the request is bounded by the
     * candidate-word count (1 or 2 per cell, matching across × down), not by grid size.
     */
    private fun candidateWordsToCheck(
        session: GameSession,
        justWritten: Position,
        entries: Map<Position, CellEntry>,
    ): List<List<Position>> {
        val candidates = mutableListOf<List<Position>>()
        for (word in session.puzzle.wordsContaining(justWritten)) {
            // Skip only if the entire word is already locked — a perpendicular
            // word crossing a locked one reuses one cell but its other cells
            // still need to be validated. Skipping on `any` (the previous
            // behavior) silently dropped every word that crossed a lock.
            if (word.all { it in session.lockedPositions }) continue
            if (word.all { entries[it] != null }) candidates += word
        }
        return candidates
    }

    private fun lettersOf(
        word: List<Position>,
        entries: Map<Position, CellEntry>,
    ): Map<Position, Letter> = word.associateWith { entries.getValue(it).letter }

    private fun passthroughOrFailure(
        lobby: Lobby,
        sessionId: SessionId,
    ): UseCaseOutcome<Lobby> =
        when {
            lobby.state != LobbyLifecycleState.IN_PROGRESS -> failure(UseCaseError.InvalidState)
            !lobby.hasJoined(sessionId) -> failure(UseCaseError.PlayerNotInLobby)
            // Otherwise the short-circuit was a locked-cell no-op: success with no events.
            else -> success(lobby, emptyList())
        }
}
