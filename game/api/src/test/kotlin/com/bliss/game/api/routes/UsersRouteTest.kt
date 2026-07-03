package com.bliss.game.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import com.bliss.game.api.dto.LobbySummaryDto
import com.bliss.game.application.auth.CookieVerifier
import com.bliss.game.application.auth.WhoAmI
import com.bliss.game.application.usecases.ListLobbiesForUser
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
import com.bliss.game.infrastructure.InMemoryLobbyRepository
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.routing.routing
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation as ServerContentNegotiation

/** Wire-path tests for GET /v1/users/me/lobbies (ADR-0066). ASCII-only test names. */
class UsersRouteTest {
    private val userId = UserId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b")
    private val phoneSession = SessionId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c")
    private val laptopSession = SessionId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6d")
    private val baseInstant: Instant = Instant.parse("2026-01-01T00:00:00Z")

    @Test
    fun `GET returns 401 when the cookie is missing or rejected`() =
        testApplication {
            setupApp(InMemoryLobbyRepository(), AlwaysNullVerifier)
            val response = client.get("/v1/users/me/lobbies")
            assertThat(response.status).isEqualTo(HttpStatusCode.Unauthorized)
        }

    @Test
    fun `GET unions lobbies across devices whose seats carry the user id`() =
        testApplication {
            val repo = InMemoryLobbyRepository()
            val phone =
                lobby(owner = phoneSession, seatUserId = userId, lastActivityAt = baseInstant.plusSeconds(100))
            val laptop =
                lobby(owner = laptopSession, seatUserId = userId, lastActivityAt = baseInstant.plusSeconds(50))
            val stranger =
                lobby(owner = SessionId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6e"), seatUserId = null)
            repo.save(phone)
            repo.save(laptop)
            repo.save(stranger)
            setupApp(repo, AlwaysValidVerifier(WhoAmI(userId, Pseudonym("Elodie"))))
            val client = jsonClient()

            val response = client.get("/v1/users/me/lobbies")

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val summaries = JSON.decodeFromString<List<LobbySummaryDto>>(response.bodyAsText())
            assertThat(summaries).hasSize(2)
            assertThat(summaries[0].id).isEqualTo(phone.id.value)
            assertThat(summaries[1].id).isEqualTo(laptop.id.value)
        }

    @Test
    fun `GET excludes WAITING lobbies and returns empty array not 404`() =
        testApplication {
            val repo = InMemoryLobbyRepository()
            repo.save(lobby(owner = phoneSession, seatUserId = userId, state = LobbyLifecycleState.WAITING))
            setupApp(repo, AlwaysValidVerifier(WhoAmI(userId, Pseudonym("Elodie"))))
            val client = jsonClient()

            val response = client.get("/v1/users/me/lobbies")

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.bodyAsText()).contains("[]")
        }

    private fun ApplicationTestBuilder.setupApp(
        repo: InMemoryLobbyRepository,
        verifier: CookieVerifier,
    ) {
        application {
            install(ServerContentNegotiation) { json(JSON) }
            routing {
                users(verifier, ListLobbiesForUser(repo))
            }
        }
    }

    private fun lobby(
        owner: SessionId,
        seatUserId: UserId?,
        state: LobbyLifecycleState = LobbyLifecycleState.IN_PROGRESS,
        lastActivityAt: Instant = baseInstant,
    ): Lobby {
        val players = mapOf(owner to Player(owner, Pseudonym("Alice"), baseInstant, userId = seatUserId))
        val game: GameSession? =
            when (state) {
                LobbyLifecycleState.WAITING -> null
                LobbyLifecycleState.IN_PROGRESS -> GameSession(puzzle(), emptyMap(), baseInstant, null)
                LobbyLifecycleState.COMPLETED -> GameSession(puzzle(), emptyMap(), baseInstant, baseInstant.plusSeconds(60))
            }
        return Lobby(
            id = LobbyId.generate(),
            ownerSessionId = owner,
            players = players,
            state = state,
            gridConfig = GridConfig(15, 12),
            game = game,
            lastActivityAt = lastActivityAt,
            code = LobbyCode.generate(),
            title = null,
        )
    }

    private fun puzzle(): GamePuzzle =
        GamePuzzle(
            id = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6f"),
            title = "Petite grille",
            language = "fr",
            width = 5,
            height = 5,
            cells = emptyList(),
            clues = emptyList(),
            createdAt = Instant.parse("2026-01-01T00:00:00Z"),
        )

    private fun ApplicationTestBuilder.jsonClient() = createClient { install(ContentNegotiation) { json(JSON) } }

    private object AlwaysNullVerifier : CookieVerifier {
        override suspend fun verify(rawCookieValue: String?): WhoAmI? = null

        override suspend fun verifyFresh(rawCookieValue: String?): WhoAmI? = null
    }

    private class AlwaysValidVerifier(
        private val result: WhoAmI,
    ) : CookieVerifier {
        override suspend fun verify(rawCookieValue: String?): WhoAmI? = result

        override suspend fun verifyFresh(rawCookieValue: String?): WhoAmI? = result
    }

    private companion object {
        private val JSON: Json =
            Json {
                encodeDefaults = true
                ignoreUnknownKeys = true
                explicitNulls = false
            }
    }
}
