package com.bliss.game.domain

import java.time.Instant
import java.util.UUID

internal object Fixtures {
    val sessionA = SessionId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b")
    val sessionB = SessionId("0190e3b2-1c45-7d2e-9a3f-c0d1e2f3a4b5")
    val userA = UserId("0190e3c0-9d67-7e8f-a1b2-c3d4e5f6a7b8")
    val userB = UserId("0190e3d1-ae78-7f90-b2c3-d4e5f6a7b8c9")
    val now: Instant = Instant.parse("2026-05-02T15:30:00Z")
    val later: Instant = Instant.parse("2026-05-02T15:33:04.250Z")

    fun player(
        sessionId: SessionId = sessionA,
        pseudonym: String = "Alice",
        joinedAt: Instant = now,
    ): Player = Player(sessionId, Pseudonym(pseudonym), joinedAt)

    /**
     * 5x5 puzzle with two letter cells (`P` at 0,3 and `A` at 0,4) and one
     * block at 0,0. Enough to exercise solved/unsolved branches.
     */
    fun puzzle(): GamePuzzle =
        GamePuzzle(
            id = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c"),
            title = "Petite grille du mardi",
            language = "fr",
            width = 5,
            height = 5,
            cells =
                listOf(
                    BlockCell(Position(0, 0)),
                    LetterCell(Position(0, 3), Letter('P')),
                    LetterCell(Position(0, 4), Letter('A')),
                ),
            clues = emptyList(),
            createdAt = now,
        )

    /** Accepts legacy sessionId-valued locks and lifts each to the anon PlayerId (playerId == sessionId). */
    fun gameSession(
        entries: Map<Position, CellEntry> = emptyMap(),
        startedAt: Instant = now,
        completedAt: Instant? = null,
        lockedPositions: Map<Position, SessionId> = emptyMap(),
    ): GameSession = GameSession(puzzle(), entries, startedAt, completedAt, lockedPositions.mapValues { pid(it.value) })

    /** PlayerId for an anon device session (playerId == sessionId). */
    fun pid(sessionId: SessionId = sessionA): PlayerId = PlayerId(sessionId.value)

    fun entry(
        letter: Char,
        writtenAt: Instant = later,
        sessionId: SessionId = sessionA,
    ): CellEntry = CellEntry(sessionId, Letter(letter), writtenAt)

    // Accepts legacy sessionId-keyed rosters; each seat is re-keyed on its derived playerId (ADR-0066 (e)).
    fun lobby(
        state: LobbyLifecycleState = LobbyLifecycleState.WAITING,
        players: Map<SessionId, Player> = mapOf(sessionA to player()),
        game: GameSession? = null,
        ownerSessionId: SessionId = sessionA,
        gridConfig: GridConfig = GridConfig(7, 7),
        lastActivityAt: Instant = now,
        code: LobbyCode = LobbyCode("A2B3C4"),
    ): Lobby =
        Lobby(
            id = LobbyId("7gQ2xK9p"),
            ownerSessionId = ownerSessionId,
            players = players.values.associateBy { it.playerId },
            state = state,
            gridConfig = gridConfig,
            game = game,
            lastActivityAt = lastActivityAt,
            code = code,
        )
}
