package com.bliss.game.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.doesNotContain
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import com.bliss.game.api.LobbyUseCases
import com.bliss.game.api.SessionManager
import com.bliss.game.api.SystemClock
import com.bliss.game.api.auth.CookieNames
import com.bliss.game.application.auth.CookieVerifier
import com.bliss.game.application.auth.WhoAmI
import com.bliss.game.application.ports.Clock
import com.bliss.game.application.ports.PuzzleProvider
import com.bliss.game.application.ports.WordValidator
import com.bliss.game.application.usecases.CreateLobbyUseCase
import com.bliss.game.application.usecases.JoinLobbyUseCase
import com.bliss.game.application.usecases.LeaveLobbyUseCase
import com.bliss.game.application.usecases.RelinquishOwnershipUseCase
import com.bliss.game.application.usecases.RematchUseCase
import com.bliss.game.application.usecases.RenameSelfUseCase
import com.bliss.game.application.usecases.ReturnToSalonUseCase
import com.bliss.game.application.usecases.RotateLobbyCodeUseCase
import com.bliss.game.application.usecases.SetGridConfigUseCase
import com.bliss.game.application.usecases.StartGameUseCase
import com.bliss.game.application.usecases.UpdateCellUseCase
import com.bliss.game.application.usecases.UseCaseOutcome
import com.bliss.game.domain.BlockCell
import com.bliss.game.domain.GameClue
import com.bliss.game.domain.GameClueDirection
import com.bliss.game.domain.GamePuzzle
import com.bliss.game.domain.Letter
import com.bliss.game.domain.LetterCell
import com.bliss.game.domain.PlayerId
import com.bliss.game.domain.Position
import com.bliss.game.domain.Pseudonym
import com.bliss.game.domain.SessionId
import com.bliss.game.domain.UserId
import com.bliss.game.infrastructure.InMemoryLobbyRepository
import io.ktor.client.plugins.websocket.DefaultClientWebSocketSession
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.header
import io.ktor.http.HttpHeaders
import io.ktor.server.application.install
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import io.ktor.websocket.send
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID
import kotlin.time.Duration.Companion.milliseconds
import io.ktor.server.websocket.WebSockets as ServerWebSockets

/**
 * Two-device account identity (ADR-0066 (e), Wave 4). A stub [CookieVerifier]
 * resolves two distinct device cookies to the SAME account; both sockets join
 * the same lobby with different sessionIds. Asserts the account is one roster
 * entry, both devices' locks tally under one PlayerId, a cellUpdated crosses
 * device-to-device (no self-echo suppression), and reconnect-grace removes the
 * player only when the LAST account socket closes.
 */
class TwoDeviceAccountIdentityTest {
    private val ownerSession = "0190e3c9-9f88-7a11-8b22-c3d4e5f60720"
    private val sessionO = "0190e3b3-2d56-7e3f-8a4b-c1d2e3f4a5b6"
    private val sessionA = "0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b"
    private val sessionB = "0190e3b2-1c45-7d2e-9a3f-b0c1d2e3f4a5"
    private val account = UserId("11111111-1111-1111-1111-111111111111")

    @Test
    fun `two devices of one account share a seat and locks while transport stays per device`() =
        testApplication {
            val clock: Clock = SystemClock
            val repo = InMemoryLobbyRepository()
            val provider =
                object : PuzzleProvider {
                    override suspend fun fetch(
                        width: Int,
                        height: Int,
                    ): GamePuzzle = twoWordPuzzle()
                }
            val validator =
                object : WordValidator {
                    override suspend fun isWordCorrect(
                        puzzleId: UUID,
                        word: Map<Position, Letter>,
                    ): Boolean = true
                }
            val createLobby = CreateLobbyUseCase(repo, clock)
            val startGameUseCase = StartGameUseCase(repo, provider, clock)
            val useCases =
                LobbyUseCases(
                    createLobby = createLobby,
                    joinLobby = JoinLobbyUseCase(repo, clock),
                    renameSelf = RenameSelfUseCase(repo, clock),
                    setGridConfig = SetGridConfigUseCase(repo, clock),
                    startGame = startGameUseCase,
                    updateCell = UpdateCellUseCase(repo, clock, validator),
                    leaveLobby = LeaveLobbyUseCase(repo, clock),
                    rotateCode = RotateLobbyCodeUseCase(repo, clock),
                    relinquishOwnership = RelinquishOwnershipUseCase(repo, clock),
                    rematch = RematchUseCase(repo, provider, clock),
                    returnToSalon = ReturnToSalonUseCase(repo, clock),
                )
            val sessionManager = SessionManager()
            val backgroundJob = SupervisorJob()
            application {
                install(ServerWebSockets)
                routing {
                    lobbyWebSocketRoute(
                        sessionManager,
                        useCases,
                        repo,
                        backgroundScope = CoroutineScope(backgroundJob + Dispatchers.Default),
                        reconnectGrace = 200.milliseconds,
                        cookieVerifier = TwoCookieVerifier(mapOf("cookie-a" to account, "cookie-b" to account)),
                    )
                }
            }
            val client = createClient { install(WebSockets) }

            val lobbyId = createLobby(SessionId(ownerSession), Pseudonym("Hote")).value.id
            val code = repo.findById(lobbyId)!!.code.value
            val url = "/v1/lobbies/${lobbyId.value}/ws"

            val observerReady = CompletableDeferred<Unit>()
            val observerSawAccountLeft = CompletableDeferred<Unit>()
            val aJoined = CompletableDeferred<Unit>()
            val bJoined = CompletableDeferred<Unit>()
            val bWord2Locked = CompletableDeferred<Unit>()
            val bSawAWrite = CompletableDeferred<Unit>()
            val aDone = CompletableDeferred<Unit>()
            val startPlay = CompletableDeferred<Unit>()
            val closeB = CompletableDeferred<Unit>()

            try {
                coroutineScope {
                    // Observer: a separate anon socket that stays connected to witness broadcasts.
                    val observer =
                        async {
                            client.webSocket(url) {
                                receiveText()
                                sendText(join(sessionO, "Obs", code))
                                drainUntil("playerJoined")
                                observerReady.complete(Unit)
                                while (!observerSawAccountLeft.isCompleted) {
                                    val text = withTimeoutOrNull(2_000) { receiveText() } ?: continue
                                    if (text.contains("\"type\":\"playerLeft\"") && text.contains(account.value)) {
                                        observerSawAccountLeft.complete(Unit)
                                    }
                                }
                            }
                        }
                    observerReady.await()

                    // Device A: first device of the account; emits the single playerJoined.
                    val deviceA =
                        async {
                            client.webSocket(url, request = { header(HttpHeaders.Cookie, "${CookieNames.SESSION}=cookie-a") }) {
                                receiveText()
                                sendText(join(sessionA, "Alice", code))
                                drainUntil("playerJoined")
                                aJoined.complete(Unit)
                                // Write only once device B is past its own word and into its listen loop,
                                // so B's drainUntil does not swallow this isolated cellUpdated.
                                bWord2Locked.await()
                                // Transport probe: an isolated cell, broadcast to every socket incl. device B.
                                sendText(cellUpdate(4, 4, "Z"))
                                sendText(cellUpdate(0, 1, "P"))
                                sendText(cellUpdate(0, 2, "A"))
                                drainUntil("wordLocked")
                                aDone.complete(Unit)
                            }
                        }
                    aJoined.await()

                    // Device B: second device, same account; idempotent join, no new playerJoined.
                    val deviceB =
                        async {
                            client.webSocket(url, request = { header(HttpHeaders.Cookie, "${CookieNames.SESSION}=cookie-b") }) {
                                receiveText()
                                sendText(join(sessionB, "Alice", code))
                                drainUntil("lobbyState")
                                bJoined.complete(Unit)
                                startPlay.await()
                                sendText(cellUpdate(2, 1, "P"))
                                sendText(cellUpdate(2, 2, "A"))
                                drainUntil("wordLocked")
                                bWord2Locked.complete(Unit)
                                while (!closeB.isCompleted) {
                                    val text = withTimeoutOrNull(2_000) { receiveText() } ?: continue
                                    if (text.contains("\"type\":\"cellUpdated\"") &&
                                        text.contains("\"row\":4") &&
                                        text.contains("\"column\":4")
                                    ) {
                                        if (!bSawAWrite.isCompleted) bSawAWrite.complete(Unit)
                                    }
                                }
                            }
                        }
                    bJoined.await()

                    // (a) The account is a single roster entry; neither device sessionId keys the roster.
                    val seated = repo.findById(lobbyId)!!.players.keys
                    assertThat(seated).contains(PlayerId(account.value))
                    assertThat(seated).doesNotContain(PlayerId(sessionA))
                    assertThat(seated).doesNotContain(PlayerId(sessionB))

                    check(startGameUseCase(lobbyId, SessionId(ownerSession)) is UseCaseOutcome.Success)
                    startPlay.complete(Unit)

                    withTimeout(5_000) { bWord2Locked.await() }
                    withTimeout(5_000) { aDone.await() }

                    // (c) Device A's isolated write reached device B — transport is per-device, never account-suppressed.
                    withTimeout(5_000) { bSawAWrite.await() }

                    // (b) Locks from both devices tally under the one account PlayerId.
                    val locks = repo.findById(lobbyId)!!.game!!.lockedPositions
                    assertThat(locks.values.toSet()).isEqualTo(setOf(PlayerId(account.value)))

                    // (d) Device A already closed on aDone; while B stays connected no playerLeft is owed.
                    delay(500)
                    assertThat(observerSawAccountLeft.isCompleted).isFalse()
                    assertThat(repo.findById(lobbyId)!!.players.keys).contains(PlayerId(account.value))

                    // Closing the LAST account socket removes the seat and broadcasts playerLeft(playerId) after grace.
                    closeB.complete(Unit)
                    withTimeout(5_000) { observerSawAccountLeft.await() }
                    assertThat(repo.findById(lobbyId)!!.players.keys).doesNotContain(PlayerId(account.value))

                    observer.cancel()
                    deviceA.cancel()
                    deviceB.cancel()
                }
            } finally {
                backgroundJob.cancel()
            }
        }

    private fun join(
        sessionId: String,
        pseudonym: String,
        code: String,
    ): String = """{"type":"joinLobby","sessionId":"$sessionId","pseudonym":"$pseudonym","code":"$code"}"""

    private fun cellUpdate(
        row: Int,
        column: Int,
        letter: String,
    ): String = """{"type":"cellUpdate","row":$row,"column":$column,"letter":"$letter"}"""

    // Two isolated across words ("PA" on rows 0 and 2) plus a lone cell that never locks,
    // so completing a word attributes a lock without solving the whole grid.
    private fun twoWordPuzzle(): GamePuzzle =
        GamePuzzle(
            id = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c"),
            title = "Deux mots",
            language = "fr",
            width = 5,
            height = 5,
            cells =
                listOf(
                    BlockCell(Position(0, 0)),
                    LetterCell(Position(0, 1), Letter('P')),
                    LetterCell(Position(0, 2), Letter('A')),
                    LetterCell(Position(2, 1), Letter('P')),
                    LetterCell(Position(2, 2), Letter('A')),
                    LetterCell(Position(4, 4), Letter('Z')),
                ),
            clues =
                listOf(
                    GameClue(UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5aca"), GameClueDirection.ACROSS, Position(0, 1), 2, "PA"),
                    GameClue(UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5acb"), GameClueDirection.ACROSS, Position(2, 1), 2, "PA"),
                ),
            createdAt = Instant.parse("2026-01-01T00:00:00Z"),
        )

    private class TwoCookieVerifier(
        private val users: Map<String, UserId>,
    ) : CookieVerifier {
        private fun who(raw: String?): WhoAmI? = users[raw]?.let { WhoAmI(it, Pseudonym("Alice")) }

        override suspend fun verify(rawCookieValue: String?): WhoAmI? = who(rawCookieValue)

        override suspend fun verifyFresh(rawCookieValue: String?): WhoAmI? = who(rawCookieValue)
    }
}

private suspend fun DefaultClientWebSocketSession.drainUntil(frameType: String) {
    while (true) {
        val text = receiveText()
        if (text.contains("\"type\":\"$frameType\"")) return
    }
}

private suspend fun DefaultClientWebSocketSession.receiveText(): String =
    withTimeout(5_000) {
        var text: String? = null
        while (text == null) {
            val frame = incoming.receive()
            if (frame is Frame.Text) text = frame.readText()
        }
        text
    }

private suspend fun DefaultClientWebSocketSession.sendText(text: String) {
    send(text)
}
