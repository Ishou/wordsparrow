package com.bliss.game.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.containsAtLeast
import assertk.assertions.containsExactly
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.containsOnly
import assertk.assertions.hasSize
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import assertk.assertions.isTrue
import com.bliss.game.application.ports.ClaimOutcome
import com.bliss.game.application.ports.RelinquishOutcome
import com.bliss.game.domain.BlockCell
import com.bliss.game.domain.CellEntry
import com.bliss.game.domain.DefinitionCell
import com.bliss.game.domain.GameArrow
import com.bliss.game.domain.GameClue
import com.bliss.game.domain.GameClueDirection
import com.bliss.game.domain.GameDefinitionClue
import com.bliss.game.domain.GamePuzzle
import com.bliss.game.domain.GameSession
import com.bliss.game.domain.GridConfig
import com.bliss.game.domain.Letter
import com.bliss.game.domain.LetterCell
import com.bliss.game.domain.Lobby
import com.bliss.game.domain.LobbyCode
import com.bliss.game.domain.LobbyId
import com.bliss.game.domain.LobbyLifecycleState
import com.bliss.game.domain.LobbyTitle
import com.bliss.game.domain.Player
import com.bliss.game.domain.Position
import com.bliss.game.domain.Pseudonym
import com.bliss.game.domain.SessionId
import com.bliss.game.domain.UserId
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName
import java.sql.Connection
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

/**
 * Contract test for [PostgresLobbyRepository] against the real V1 schema
 * applied by Flyway inside a Testcontainers Postgres. Mirrors the boot
 * pattern in [com.bliss.grid.infrastructure.persistence.PostgresPuzzleRepositoryTest]
 * (grid context) and [MigrationTest] (this module).
 *
 * Covers every method on the LobbyRepository port plus the FOR-UPDATE
 * concurrency contract that the in-memory adapter promises via
 * ReentrantLock.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PostgresLobbyRepositoryTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var repo: PostgresLobbyRepository

    private val baseInstant: Instant = Instant.parse("2026-05-11T10:00:00Z")
    private val sessionA = SessionId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b")
    private val sessionB = SessionId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c")
    private val sessionC = SessionId("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6d")

    @BeforeAll
    fun startPostgres() {
        assumeTrue(DockerClientFactory.instance().isDockerAvailable()) { "Docker daemon not available" }
        pg = PostgreSQLContainer(DockerImageName.parse("postgres:16-alpine")).apply { start() }
        dataSource =
            HikariDataSource(
                HikariConfig().apply {
                    jdbcUrl = pg.jdbcUrl
                    username = pg.username
                    password = pg.password
                    maximumPoolSize = 4
                },
            )
        Flyway
            .configure()
            .dataSource(dataSource)
            .locations("classpath:db/migration")
            .load()
            .migrate()
        repo = PostgresLobbyRepository(dataSource)
    }

    @AfterAll
    fun stopPostgres() {
        if (::dataSource.isInitialized) dataSource.close()
        if (::pg.isInitialized) pg.stop()
    }

    @BeforeEach
    fun cleanTables() {
        if (!::repo.isInitialized) return
        dataSource.connection.use { conn ->
            conn.createStatement().use { it.executeUpdate("TRUNCATE lobbies CASCADE") }
        }
    }

    @Test
    fun `save then findById round-trips a WAITING lobby`() =
        runTest {
            val lobby = waitingLobby(id = LobbyId.generate())

            repo.save(lobby)
            val loaded = repo.findById(lobby.id)

            assertThat(loaded).isEqualTo(lobby)
        }

    @Test
    fun `save then findById round-trips an IN_PROGRESS lobby including game and entries`() =
        runTest {
            val lobby = inProgressLobby(id = LobbyId.generate())

            repo.save(lobby)
            val loaded = repo.findById(lobby.id)

            assertThat(loaded).isNotNull()
            assertThat(loaded!!).isEqualTo(lobby)
            val loadedGame = loaded.game
            val originalGame = lobby.game
            assertThat(loadedGame).isNotNull()
            assertThat(loadedGame!!.entries).isEqualTo(originalGame!!.entries)
            assertThat(loadedGame.lockedPositions).isEqualTo(originalGame.lockedPositions)
        }

    // ADR-0086 back-compat: legacy game_payload has lockedPositions entries with no `lockedBy`; the reader must hydrate them (absent -> SessionId.ANON) instead of 400ing the my-lobbies read.
    @Test
    fun `findById tolerates a legacy game_payload whose lockedPositions omit lockedBy`() =
        runTest {
            val id = LobbyId.generate()
            val ownerUserId = UserId("99999999-9999-4999-8999-999999999999")
            insertLegacyLobbyRow(id, ownerUserId, legacyPayloadWithoutLockedBy())

            val loaded = repo.findById(id)

            assertThat(loaded).isNotNull()
            val game = loaded!!.game
            assertThat(game).isNotNull()
            assertThat(game!!.lockedPositions).isEqualTo(mapOf(Position(0, 0) to SessionId.ANON))
        }

    @Test
    fun `findByUserId tolerates a legacy game_payload whose lockedPositions omit lockedBy`() =
        runTest {
            val id = LobbyId.generate()
            val ownerUserId = UserId("99999999-9999-4999-8999-999999999999")
            insertLegacyLobbyRow(id, ownerUserId, legacyPayloadWithoutLockedBy())

            val result = repo.findByUserId(ownerUserId)

            assertThat(result.map { it.id }).containsExactly(id)
            assertThat(result[0].game!!.lockedPositions).isEqualTo(mapOf(Position(0, 0) to SessionId.ANON))
        }

    @Test
    fun `save is idempotent - saving the same lobby twice yields the same state`() =
        runTest {
            val lobby = inProgressLobby(id = LobbyId.generate())

            repo.save(lobby)
            repo.save(lobby)

            assertThat(repo.findById(lobby.id)).isEqualTo(lobby)
        }

    @Test
    fun `save replaces children on update - removed players and entries disappear`() =
        runTest {
            val original =
                inProgressLobby(id = LobbyId.generate()).let { l ->
                    val secondPlayer = Player(sessionB, Pseudonym("Bob"), baseInstant.plusSeconds(10))
                    l.copy(players = l.players + (sessionB to secondPlayer))
                }
            repo.save(original)

            // Remove Bob and one of the entries on update.
            val originalGame = original.game!!
            val firstEntry = originalGame.entries.entries.first()
            val trimmed =
                original.copy(
                    players = original.players - sessionB,
                    game = originalGame.copy(entries = mapOf(firstEntry.key to firstEntry.value)),
                )
            repo.save(trimmed)

            val loaded = repo.findById(original.id)
            assertThat(loaded).isNotNull()
            assertThat(loaded!!.players).hasSize(1)
            assertThat(loaded.game!!.entries).hasSize(1)
        }

    @Test
    fun `findByCode returns null when code is unknown`() =
        runTest {
            assertThat(repo.findByCode(LobbyCode.generate())).isNull()
        }

    @Test
    fun `findByCode returns the saved lobby`() =
        runTest {
            val lobby = waitingLobby(id = LobbyId.generate())
            repo.save(lobby)

            val loaded = repo.findByCode(lobby.code)

            assertThat(loaded).isEqualTo(lobby)
        }

    @Test
    fun `findWaitingByOwnerSession returns null when no waiting lobby exists`() =
        runTest {
            assertThat(repo.findWaitingByOwnerSession(sessionA)).isNull()
        }

    @Test
    fun `findWaitingByOwnerSession returns the waiting lobby owned by the session`() =
        runTest {
            val lobby = waitingLobby(id = LobbyId.generate(), owner = sessionA)
            repo.save(lobby)

            val loaded = repo.findWaitingByOwnerSession(sessionA)

            assertThat(loaded).isEqualTo(lobby)
        }

    @Test
    fun `findWaitingByOwnerSession does not return IN_PROGRESS lobbies for the same owner`() =
        runTest {
            val lobby = inProgressLobby(id = LobbyId.generate(), owner = sessionA)
            repo.save(lobby)

            assertThat(repo.findWaitingByOwnerSession(sessionA)).isNull()
        }

    @Test
    fun `findWaitingByOwnerUser returns the WAITING lobby whose owner seat holds the userId`() =
        runTest {
            val userId = UserId("11111111-1111-1111-1111-111111111111")
            val lobby = waitingLobby(id = LobbyId.generate(), owner = sessionA, ownerUserId = userId)
            repo.save(lobby)

            val loaded = repo.findWaitingByOwnerUser(userId)

            assertThat(loaded).isEqualTo(lobby)
        }

    @Test
    fun `findWaitingByOwnerUser returns null when no waiting lobby carries the userId`() =
        runTest {
            val userId = UserId("11111111-1111-1111-1111-111111111111")
            repo.save(waitingLobby(id = LobbyId.generate(), owner = sessionA, ownerUserId = null))

            assertThat(repo.findWaitingByOwnerUser(userId)).isNull()
        }

    @Test
    fun `findWaitingByOwnerUser does not return IN_PROGRESS lobbies for the same user`() =
        runTest {
            val userId = UserId("11111111-1111-1111-1111-111111111111")
            repo.save(inProgressLobby(id = LobbyId.generate(), owner = sessionA, ownerUserId = userId))

            assertThat(repo.findWaitingByOwnerUser(userId)).isNull()
        }

    // ADR-0098 §1: the active-game quota counts WAITING and IN_PROGRESS owned lobbies (invert the
    // findWaitingByOwnerUser IN_PROGRESS exclusion above), keyed on owner_user_id.
    @Test
    fun `findActiveByOwnerUser returns a WAITING owned lobby`() =
        runTest {
            val userId = UserId("11111111-1111-1111-1111-111111111111")
            val lobby = waitingLobby(id = LobbyId.generate(), owner = sessionA, ownerUserId = userId)
            repo.save(lobby)

            assertThat(repo.findActiveByOwnerUser(userId)).isEqualTo(lobby)
        }

    @Test
    fun `findActiveByOwnerUser returns an IN_PROGRESS owned lobby`() =
        runTest {
            val userId = UserId("11111111-1111-1111-1111-111111111111")
            val lobby = inProgressLobby(id = LobbyId.generate(), owner = sessionA, ownerUserId = userId)
            repo.save(lobby)

            assertThat(repo.findActiveByOwnerUser(userId)!!.id).isEqualTo(lobby.id)
        }

    @Test
    fun `findActiveByOwnerUser ignores a COMPLETED owned lobby`() =
        runTest {
            val userId = UserId("11111111-1111-1111-1111-111111111111")
            val completed =
                inProgressLobby(id = LobbyId.generate(), owner = sessionA, ownerUserId = userId)
                    .let {
                        it.copy(
                            state = LobbyLifecycleState.COMPLETED,
                            game = it.game!!.copy(completedAt = baseInstant.plusSeconds(120)),
                        )
                    }
            repo.save(completed)

            assertThat(repo.findActiveByOwnerUser(userId)).isNull()
        }

    @Test
    fun `findActiveByOwnerUser returns null for a relinquished (ownerless) lobby`() =
        runTest {
            val userId = UserId("11111111-1111-1111-1111-111111111111")
            repo.save(inProgressLobby(id = LobbyId.generate(), owner = sessionA, ownerUserId = null))

            assertThat(repo.findActiveByOwnerUser(userId)).isNull()
        }

    // ADR-0098 §4: ownerless (owner_user_id IS NULL) non-terminal lobbies idle past the cutoff.
    @Test
    fun `findIdleOwnerless returns ownerless non-terminal lobbies at or before the cutoff`() =
        runTest {
            val idleWaiting =
                waitingLobby(id = LobbyId.generate(), owner = sessionA, ownerUserId = null)
                    .copy(lastActivityAt = baseInstant.minusSeconds(3600))
            val idleInProgress =
                inProgressLobby(id = LobbyId.generate(), owner = sessionB, ownerUserId = null)
                    .copy(lastActivityAt = baseInstant.minusSeconds(3600))
            val ownedInProgress =
                inProgressLobby(
                    id = LobbyId.generate(),
                    owner = sessionC,
                    ownerUserId = UserId("11111111-1111-1111-1111-111111111111"),
                ).copy(lastActivityAt = baseInstant.minusSeconds(3600))
            val freshOwnerless =
                waitingLobby(id = LobbyId.generate(), owner = sessionA, ownerUserId = null)
                    .copy(lastActivityAt = baseInstant.plusSeconds(3600))
            repo.save(idleWaiting)
            repo.save(idleInProgress)
            repo.save(ownedInProgress)
            repo.save(freshOwnerless)

            val result = repo.findIdleOwnerless(baseInstant)

            assertThat(result.map { it.id }).containsExactlyInAnyOrder(idleWaiting.id, idleInProgress.id)
        }

    @Test
    fun `findIdleOwnerless excludes COMPLETED ownerless lobbies`() =
        runTest {
            // completedLobby defaults ownerUserId to null (inProgressLobby default), so it is ownerless.
            val completedOwnerless =
                completedLobby(id = LobbyId.generate(), owner = sessionA)
                    .copy(lastActivityAt = baseInstant.minusSeconds(3600))
            repo.save(completedOwnerless)

            assertThat(repo.findIdleOwnerless(baseInstant)).isEmpty()
        }

    @Test
    fun `findIdleWaiting returns waiting lobbies at or before the cutoff and excludes IN_PROGRESS`() =
        runTest {
            val idleWaiting =
                waitingLobby(
                    id = LobbyId.generate(),
                    lastActivityAt = baseInstant.minusSeconds(3600),
                )
            val freshWaiting =
                waitingLobby(
                    id = LobbyId.generate(),
                    owner = sessionB,
                    lastActivityAt = baseInstant.plusSeconds(3600),
                )
            val idleInProgress =
                inProgressLobby(
                    id = LobbyId.generate(),
                    owner = sessionC,
                ).let { it.copy(lastActivityAt = baseInstant.minusSeconds(3600)) }
            repo.save(idleWaiting)
            repo.save(freshWaiting)
            repo.save(idleInProgress)

            val result = repo.findIdleWaiting(baseInstant)

            assertThat(result.map { it.id }).containsExactly(idleWaiting.id)
        }

    @Test
    fun `findIdleCompleted returns completed lobbies at or before the cutoff and excludes WAITING and IN_PROGRESS`() =
        runTest {
            val idleCompleted =
                completedLobby(
                    id = LobbyId.generate(),
                    owner = sessionA,
                ).let { it.copy(lastActivityAt = baseInstant.minusSeconds(3600)) }
            val freshCompleted =
                completedLobby(
                    id = LobbyId.generate(),
                    owner = sessionB,
                ).let { it.copy(lastActivityAt = baseInstant.plusSeconds(3600)) }
            val idleWaiting =
                waitingLobby(
                    id = LobbyId.generate(),
                    owner = sessionC,
                    lastActivityAt = baseInstant.minusSeconds(3600),
                )
            repo.save(idleCompleted)
            repo.save(freshCompleted)
            repo.save(idleWaiting)

            val result = repo.findIdleCompleted(baseInstant)

            assertThat(result.map { it.id }).containsExactly(idleCompleted.id)
        }

    // ADR-0039 amendment 2026-05-12: WAITING lobbies are excluded from the
    // "Mes parties" listing; only IN_PROGRESS and COMPLETED are returned,
    // ordered by lastActivityAt descending.
    @Test
    fun `findBySessionId returns only IN_PROGRESS and COMPLETED ordered by lastActivityAt desc`() =
        runTest {
            val waiting =
                waitingLobby(id = LobbyId.generate(), owner = sessionA)
                    .copy(lastActivityAt = baseInstant.minusSeconds(60))
            val inProgress =
                inProgressLobby(id = LobbyId.generate(), owner = sessionA)
                    .copy(lastActivityAt = baseInstant.plusSeconds(60))
            val completed =
                completedLobby(id = LobbyId.generate(), owner = sessionA)
                    .copy(lastActivityAt = baseInstant)
            val otherSession =
                inProgressLobby(id = LobbyId.generate(), owner = sessionB)
                    .copy(lastActivityAt = baseInstant.plusSeconds(120))
            repo.save(waiting)
            repo.save(inProgress)
            repo.save(completed)
            repo.save(otherSession)

            val result = repo.findBySessionId(sessionA)

            assertThat(result.map { it.id }).containsExactly(inProgress.id, completed.id)
        }

    @Test
    fun `findBySessionId excludes a WAITING lobby and returns the IN_PROGRESS one`() =
        runTest {
            val waiting =
                waitingLobby(id = LobbyId.generate(), owner = sessionA)
                    .copy(lastActivityAt = baseInstant.plusSeconds(10))
            val inProgress =
                inProgressLobby(id = LobbyId.generate(), owner = sessionA)
                    .copy(lastActivityAt = baseInstant.plusSeconds(20))
            repo.save(waiting)
            repo.save(inProgress)

            val result = repo.findBySessionId(sessionA)

            assertThat(result.map { it.id }).containsExactly(inProgress.id)
        }

    @Test
    fun `findBySessionId still returns COMPLETED lobbies`() =
        runTest {
            val completed =
                completedLobby(id = LobbyId.generate(), owner = sessionA)
                    .copy(lastActivityAt = baseInstant.plusSeconds(5))
            repo.save(completed)

            val result = repo.findBySessionId(sessionA)

            assertThat(result.map { it.id }).containsExactly(completed.id)
        }

    // ADR-0055 amendment 2026-07-03: an authed seat exempts a COMPLETED lobby from GC.
    @Test
    fun `findIdleCompleted excludes an idle COMPLETED lobby whose seat carries a userId`() =
        runTest {
            val authed =
                completedLobby(id = LobbyId.generate(), owner = sessionA)
                    .let {
                        it.copy(
                            players =
                                it.players.mapValues { (_, p) ->
                                    p.copy(userId = UserId("44444444-4444-4444-4444-444444444444"))
                                },
                            lastActivityAt = baseInstant.minusSeconds(3600),
                        )
                    }
            val anonIdle =
                completedLobby(id = LobbyId.generate(), owner = sessionB)
                    .copy(lastActivityAt = baseInstant.minusSeconds(3600))
            repo.save(authed)
            repo.save(anonIdle)

            val result = repo.findIdleCompleted(baseInstant)

            assertThat(result.map { it.id }).containsExactly(anonIdle.id)
        }

    // ADR-0055/0066 regression: after the leave-grace drops the owner seat, only owner_user_id marks the lobby as authed — the GC must not delete it despite there being no authed seat.
    @Test
    fun `findIdleCompleted excludes an owner-owned lobby after the owner seat is gone`() =
        runTest {
            val ownerUserId = UserId("66666666-6666-6666-6666-666666666666")
            val ownerOwned =
                completedLobby(id = LobbyId.generate(), owner = sessionA)
                    .copy(ownerUserId = ownerUserId, lastActivityAt = baseInstant.minusSeconds(3600))
            repo.save(ownerOwned)
            // Leave-grace equivalent: the owner's seat is dropped, keeping the row and owner_user_id.
            repo.mutate(ownerOwned.id) { it.copy(players = it.players - sessionA) }
            val anonIdle =
                completedLobby(id = LobbyId.generate(), owner = sessionB)
                    .copy(lastActivityAt = baseInstant.minusSeconds(3600))
            repo.save(anonIdle)

            val result = repo.findIdleCompleted(baseInstant)

            assertThat(result.map { it.id }).containsExactly(anonIdle.id)
        }

    // ADR-0066: cross-device union keyed by the seat userId stamped at rebind.
    @Test
    fun `findByUserId unions seats across sessions and keeps the state filter and ordering`() =
        runTest {
            val userId = UserId("22222222-2222-2222-2222-222222222222")
            val phone =
                inProgressLobby(id = LobbyId.generate(), owner = sessionA, ownerUserId = userId)
                    .copy(lastActivityAt = baseInstant.plusSeconds(60))
            val laptop =
                completedLobby(id = LobbyId.generate(), owner = sessionB)
                    .let { it.copy(players = it.players.mapValues { (_, p) -> p.copy(userId = userId) }, lastActivityAt = baseInstant) }
            val waiting =
                waitingLobby(id = LobbyId.generate(), owner = sessionA, ownerUserId = userId)
                    .copy(lastActivityAt = baseInstant.plusSeconds(120))
            val stranger = inProgressLobby(id = LobbyId.generate(), owner = sessionB)
            repo.save(phone)
            repo.save(laptop)
            repo.save(waiting)
            repo.save(stranger)

            val result = repo.findByUserId(userId)

            assertThat(result.map { it.id }).containsExactly(phone.id, laptop.id)
        }

    @Test
    fun `findByUserId returns empty when no seat carries the userId`() =
        runTest {
            repo.save(inProgressLobby(id = LobbyId.generate(), owner = sessionA))

            val result = repo.findByUserId(UserId("33333333-3333-3333-3333-333333333333"))

            assertThat(result).isEmpty()
        }

    // ADR-0066 amendment 2026-07-05 regression: after the leave-grace drops the owner's lobby_players seat, the owner arm keeps the started lobby visible on the user tab.
    @Test
    fun `findByUserId still returns an owner-owned lobby after the owner leaves lobby_players`() =
        runTest {
            val userId = UserId("55555555-5555-5555-5555-555555555555")
            val lobby = inProgressLobby(id = LobbyId.generate(), owner = sessionA, ownerUserId = userId)
            repo.save(lobby)

            // Leave-grace equivalent: LeaveLobbyUseCase drops the owner's seat, keeping the row.
            val afterLeave = repo.mutate(lobby.id) { it.copy(players = it.players - sessionA) }

            assertThat(afterLeave).isNotNull()
            assertThat(afterLeave!!.players).isEmpty()
            assertThat(afterLeave.ownerUserId).isEqualTo(userId)
            assertThat(repo.findByUserId(userId).map { it.id }).containsExactly(lobby.id)
        }

    @Test
    fun `findBySessionId returns empty when the session is not in any lobby`() =
        runTest {
            repo.save(inProgressLobby(id = LobbyId.generate(), owner = sessionA))

            assertThat(repo.findBySessionId(sessionB)).isEmpty()
        }

    @Test
    fun `findBySessionId returns lobbies the session owns even after they left lobby_players`() =
        runTest {
            val ownedButLeft =
                Lobby(
                    id = LobbyId.generate(),
                    ownerSessionId = sessionA,
                    players = mapOf(sessionB to Player(sessionB, Pseudonym("Bob"), baseInstant)),
                    state = LobbyLifecycleState.IN_PROGRESS,
                    gridConfig = GridConfig(samplePuzzle().width, samplePuzzle().height),
                    game =
                        GameSession(
                            puzzle = samplePuzzle(),
                            entries = emptyMap(),
                            startedAt = baseInstant,
                            completedAt = null,
                            lockedPositions = emptyMap(),
                        ),
                    lastActivityAt = baseInstant.plusSeconds(30),
                    code = LobbyCode.generate(),
                )
            repo.save(ownedButLeft)

            val result = repo.findBySessionId(sessionA)

            assertThat(result.map { it.id }).containsExactly(ownedButLeft.id)
            assertThat(result[0].ownerSessionId).isEqualTo(sessionA)
            assertThat(result[0].players.keys).containsOnly(sessionB)
        }

    @Test
    fun `findBySessionId does not duplicate when session is both owner and player`() =
        runTest {
            val ownedAndJoined = inProgressLobby(id = LobbyId.generate(), owner = sessionA)
            repo.save(ownedAndJoined)

            val result = repo.findBySessionId(sessionA)

            assertThat(result.map { it.id }).containsExactly(ownedAndJoined.id)
        }

    @Test
    fun `delete removes the lobby and cascades to players and entries`() =
        runTest {
            val lobby = inProgressLobby(id = LobbyId.generate())
            repo.save(lobby)

            repo.delete(lobby.id)

            assertThat(repo.findById(lobby.id)).isNull()
            assertThat(countChildRows("lobby_players", lobby.id)).isEqualTo(0)
            assertThat(countChildRows("lobby_cell_entries", lobby.id)).isEqualTo(0)
        }

    @Test
    fun `mutate read-modify-writes new state and returns it`() =
        runTest {
            val lobby = waitingLobby(id = LobbyId.generate(), owner = sessionA)
            repo.save(lobby)
            val newcomer = Player(sessionB, Pseudonym("Bob"), baseInstant.plusSeconds(30))

            val mutated =
                repo.mutate(lobby.id) { current ->
                    current.copy(players = current.players + (sessionB to newcomer))
                }

            assertThat(mutated).isNotNull()
            assertThat(mutated!!.players).hasSize(2)
            assertThat(repo.findById(lobby.id)).isEqualTo(mutated)
        }

    @Test
    fun `mutate returning null atomically deletes the lobby`() =
        runTest {
            val lobby = inProgressLobby(id = LobbyId.generate())
            repo.save(lobby)

            val result = repo.mutate(lobby.id) { null }

            assertThat(result).isNull()
            assertThat(repo.findById(lobby.id)).isNull()
            assertThat(countChildRows("lobby_players", lobby.id)).isEqualTo(0)
            assertThat(countChildRows("lobby_cell_entries", lobby.id)).isEqualTo(0)
        }

    @Test
    fun `mutate throwing rolls back and leaves the lobby unchanged`() =
        runTest {
            val lobby = waitingLobby(id = LobbyId.generate())
            repo.save(lobby)

            val boom =
                runCatching {
                    repo.mutate(lobby.id) { error("boom") }
                }
            assertThat(boom.isFailure).isTrue()
            assertThat(repo.findById(lobby.id)).isEqualTo(lobby)
        }

    @Test
    fun `mutate returns null when the lobby does not exist`() =
        runTest {
            val result = repo.mutate(LobbyId.generate()) { error("mutator should not run") }
            assertThat(result).isNull()
        }

    // ADR-0098 §2 LOAD-BEARING: relinquish must null owner_user_id in Postgres. The general upsert
    // EXCLUDES owner_user_id from its ON CONFLICT (write-once, ADR-0066), so this can only work via
    // the dedicated UPDATE; a mutate/save round-trip would silently keep the old owner_user_id.
    @Test
    fun `relinquishOwnership nulls owner_user_id and drops the owner seat, persisted through reload`() =
        runTest {
            val userA = UserId("11111111-1111-1111-1111-111111111111")
            val base = inProgressLobby(id = LobbyId.generate(), owner = sessionA, ownerUserId = userA)
            val withOther =
                base.copy(
                    players =
                        base.players +
                            (sessionB to Player(sessionB, Pseudonym("Bob"), baseInstant.plusSeconds(10))),
                )
            repo.save(withOther)
            val now = baseInstant.plusSeconds(120)

            val outcome = repo.relinquishOwnership(withOther.id, sessionA, now)

            assertThat(outcome).isInstanceOf(RelinquishOutcome.Relinquished::class)
            val returned = (outcome as RelinquishOutcome.Relinquished).lobby
            assertThat(returned.ownerUserId).isNull()
            assertThat(returned.players.keys).containsOnly(sessionB)
            // Reload from Postgres proves the owner_user_id clear survived (upsert would have kept it).
            val reloaded = repo.findById(withOther.id)!!
            assertThat(reloaded.ownerUserId).isNull()
            assertThat(reloaded.lastActivityAt).isEqualTo(now)
            assertThat(repo.findActiveByOwnerUser(userA)).isNull()
        }

    @Test
    fun `relinquishOwnership returns NotOwner when the caller does not own the lobby`() =
        runTest {
            val userA = UserId("11111111-1111-1111-1111-111111111111")
            val base = inProgressLobby(id = LobbyId.generate(), owner = sessionA, ownerUserId = userA)
            val withOther =
                base.copy(
                    players =
                        base.players +
                            (sessionB to Player(sessionB, Pseudonym("Bob"), baseInstant.plusSeconds(10))),
                )
            repo.save(withOther)

            val outcome = repo.relinquishOwnership(withOther.id, sessionB, baseInstant.plusSeconds(120))

            assertThat(outcome).isEqualTo(RelinquishOutcome.NotOwner)
            assertThat(repo.findById(withOther.id)!!.ownerUserId).isEqualTo(userA)
        }

    @Test
    fun `relinquishOwnership returns LobbyNotFound for an unknown lobby`() =
        runTest {
            val outcome = repo.relinquishOwnership(LobbyId.generate(), sessionA, baseInstant)
            assertThat(outcome).isEqualTo(RelinquishOutcome.LobbyNotFound)
        }

    // ADR-0098 §2 LOAD-BEARING: claim must write owner_user_id in Postgres despite the upsert exclusion.
    @Test
    fun `claimOwnership writes owner_user_id and owner_session_id on an ownerless lobby, persisted through reload`() =
        runTest {
            val userB = UserId("22222222-2222-2222-2222-222222222222")
            // Ownerless in-progress lobby (relinquished/vacated shape): owner_user_id null, sessionB present.
            val base = inProgressLobby(id = LobbyId.generate(), owner = SessionId.ANON, ownerUserId = null)
            val ownerless =
                base.copy(
                    players =
                        mapOf(
                            sessionB to Player(sessionB, Pseudonym("Bob"), baseInstant.plusSeconds(10), userId = userB),
                        ),
                )
            repo.save(ownerless)
            val now = baseInstant.plusSeconds(200)

            val outcome = repo.claimOwnership(ownerless.id, sessionB, userB, now)

            assertThat(outcome).isInstanceOf(ClaimOutcome.Claimed::class)
            val returned = (outcome as ClaimOutcome.Claimed).lobby
            assertThat(returned.ownerUserId).isEqualTo(userB)
            assertThat(returned.ownerSessionId).isEqualTo(sessionB)
            // Reload proves the owner_user_id write survived (upsert would have dropped it).
            val reloaded = repo.findById(ownerless.id)!!
            assertThat(reloaded.ownerUserId).isEqualTo(userB)
            assertThat(reloaded.ownerSessionId).isEqualTo(sessionB)
            assertThat(reloaded.lastActivityAt).isEqualTo(now)
            assertThat(repo.findActiveByOwnerUser(userB)!!.id).isEqualTo(ownerless.id)
        }

    @Test
    fun `claimOwnership returns AlreadyOwned when the lobby still has an owner`() =
        runTest {
            val userA = UserId("11111111-1111-1111-1111-111111111111")
            val userB = UserId("22222222-2222-2222-2222-222222222222")
            val base = inProgressLobby(id = LobbyId.generate(), owner = sessionA, ownerUserId = userA)
            val withOther =
                base.copy(
                    players =
                        base.players +
                            (sessionB to Player(sessionB, Pseudonym("Bob"), baseInstant.plusSeconds(10), userId = userB)),
                )
            repo.save(withOther)

            val outcome = repo.claimOwnership(withOther.id, sessionB, userB, baseInstant.plusSeconds(200))

            assertThat(outcome).isEqualTo(ClaimOutcome.AlreadyOwned)
            assertThat(repo.findById(withOther.id)!!.ownerUserId).isEqualTo(userA)
        }

    @Test
    fun `claimOwnership returns NotPresentInLobby when the claimer has no seat`() =
        runTest {
            val userB = UserId("22222222-2222-2222-2222-222222222222")
            val ownerless =
                inProgressLobby(id = LobbyId.generate(), owner = SessionId.ANON, ownerUserId = null)
                    .copy(players = mapOf(sessionA to Player(sessionA, Pseudonym("Alice"), baseInstant)))
            repo.save(ownerless)

            val outcome = repo.claimOwnership(ownerless.id, sessionB, userB, baseInstant.plusSeconds(200))

            assertThat(outcome).isEqualTo(ClaimOutcome.NotPresentInLobby)
            assertThat(repo.findById(ownerless.id)!!.ownerUserId).isNull()
        }

    @Test
    fun `eraseSession rule 1 - sole-owner lobby is deleted and children cascade`() =
        runTest {
            val lobby = waitingLobby(id = LobbyId.generate(), owner = sessionA)
            repo.save(lobby)

            val result = repo.eraseSession(sessionA)

            assertThat(result.deletedLobbies).isEqualTo(1)
            assertThat(result.vacatedLobbies).isEqualTo(0)
            assertThat(result.removedPlayerships).isEqualTo(0)
            assertThat(result.anonymisedEntries).isEqualTo(0)
            assertThat(repo.findById(lobby.id)).isNull()
            assertThat(countChildRows("lobby_players", lobby.id)).isEqualTo(0)
            assertThat(countChildRows("lobby_cell_entries", lobby.id)).isEqualTo(0)
        }

    @Test
    fun `eraseSession rule 2 - owner with remaining players - lobby is vacated to ownerless`() =
        runTest {
            val base = inProgressLobby(id = LobbyId.generate(), owner = sessionA)
            val withOthers =
                base.copy(
                    players =
                        base.players +
                            (sessionB to Player(sessionB, Pseudonym("Bob"), baseInstant.plusSeconds(10))) +
                            (sessionC to Player(sessionC, Pseudonym("Carol"), baseInstant.plusSeconds(20))),
                )
            repo.save(withOthers)

            val result = repo.eraseSession(sessionA)

            assertThat(result.deletedLobbies).isEqualTo(0)
            assertThat(result.vacatedLobbies).isEqualTo(1)
            assertThat(result.removedPlayerships).isEqualTo(1)
            // Both seeded entries authored by sessionA (Alice) get anonymised.
            assertThat(result.anonymisedEntries).isEqualTo(2)
            val after = repo.findById(withOthers.id)
            assertThat(after).isNotNull()
            // Vacated to ownerless: owner_user_id cleared, owner_session_id points at the anon sentinel.
            assertThat(after!!.ownerUserId).isNull()
            assertThat(after.ownerSessionId).isEqualTo(SessionId.ANON)
            assertThat(after.players.keys.toList()).containsOnly(sessionB, sessionC)
            // After anonymisation, every entry's sessionId is the ANON sentinel.
            after.game!!.entries.values.forEach {
                assertThat(it.sessionId).isEqualTo(SessionId.ANON)
            }
        }

    // ADR-0098 §3 regression: vacating clears owner_user_id so the erased user cannot linger in findByUserId, and no unconsenting player is conscripted into ownership.
    @Test
    fun `eraseSession rule 2 - owner_user_id is cleared and no longer surfaces the erased user`() =
        runTest {
            val erasedUserId = UserId("77777777-7777-7777-7777-777777777777")
            val remainingUserId = UserId("88888888-8888-8888-8888-888888888888")
            val base = inProgressLobby(id = LobbyId.generate(), owner = sessionA, ownerUserId = erasedUserId)
            val withOther =
                base.copy(
                    players =
                        base.players +
                            (sessionB to Player(sessionB, Pseudonym("Bob"), baseInstant.plusSeconds(10), userId = remainingUserId)),
                )
            repo.save(withOther)

            val result = repo.eraseSession(sessionA)

            assertThat(result.vacatedLobbies).isEqualTo(1)
            val after = repo.findById(withOther.id)
            assertThat(after).isNotNull()
            assertThat(after!!.ownerSessionId).isEqualTo(SessionId.ANON)
            // Vacated, not conscripted: the remaining player is not made owner.
            assertThat(after.ownerUserId).isNull()
            // The erased user's UserId must no longer surface the lobby via the owner arm.
            assertThat(repo.findByUserId(erasedUserId)).isEmpty()
        }

    @Test
    fun `eraseSession rule 3 - non-owner is removed and entries anonymised`() =
        runTest {
            val base = inProgressLobby(id = LobbyId.generate(), owner = sessionA)
            // Add sessionB as a non-owner member; rewrite the seed entries
            // so one of them is authored by sessionB (so we can assert
            // anonymisation count of exactly 1).
            val withGuest =
                base.copy(
                    players =
                        base.players +
                            (sessionB to Player(sessionB, Pseudonym("Bob"), baseInstant.plusSeconds(10))),
                    game =
                        base.game!!.copy(
                            entries =
                                mapOf(
                                    Position(0, 0) to CellEntry(sessionA, Letter('B'), baseInstant.plusSeconds(5)),
                                    Position(0, 1) to CellEntry(sessionB, Letter('L'), baseInstant.plusSeconds(6)),
                                ),
                        ),
                )
            repo.save(withGuest)

            val result = repo.eraseSession(sessionB)

            assertThat(result.deletedLobbies).isEqualTo(0)
            assertThat(result.vacatedLobbies).isEqualTo(0)
            assertThat(result.removedPlayerships).isEqualTo(1)
            assertThat(result.anonymisedEntries).isEqualTo(1)
            val after = repo.findById(withGuest.id)
            assertThat(after).isNotNull()
            assertThat(after!!.ownerSessionId).isEqualTo(sessionA) // unchanged
            assertThat(after.players.keys.toList()).containsOnly(sessionA)
            val anonEntry = after.game!!.entries[Position(0, 1)]
            assertThat(anonEntry).isNotNull()
            assertThat(anonEntry!!.sessionId).isEqualTo(SessionId.ANON)
            // sessionA's entry remains attributed.
            assertThat(after.game!!.entries[Position(0, 0)]!!.sessionId).isEqualTo(sessionA)
        }

    @Test
    fun `eraseSession is idempotent - second call returns all zeros`() =
        runTest {
            val lobby = waitingLobby(id = LobbyId.generate(), owner = sessionA)
            repo.save(lobby)

            val first = repo.eraseSession(sessionA)
            val second = repo.eraseSession(sessionA)

            assertThat(first.deletedLobbies).isEqualTo(1)
            assertThat(second.deletedLobbies).isEqualTo(0)
            assertThat(second.vacatedLobbies).isEqualTo(0)
            assertThat(second.removedPlayerships).isEqualTo(0)
            assertThat(second.anonymisedEntries).isEqualTo(0)
        }

    @Test
    fun `eraseSession returns Empty when the session is in no lobby`() =
        runTest {
            assertThat(repo.eraseSession(sessionA).deletedLobbies).isEqualTo(0)
        }

    @Test
    fun `rebindAnonSeats updates only matching anon seats and returns touched lobby ids`() =
        runTest {
            val userId = UserId("11111111-1111-1111-1111-111111111111")
            // Lobby A: sessionA is anon (no userId). Should be rebound.
            val lobbyA = waitingLobby(id = LobbyId.generate(), owner = sessionA)
            // Lobby B: sessionA is already authed (userId != null). Should NOT be touched.
            val lobbyBOwner = Player(sessionA, Pseudonym("Alice"), baseInstant, userId = userId)
            val lobbyB =
                waitingLobby(id = LobbyId.generate(), owner = sessionA).copy(
                    players = mapOf(sessionA to lobbyBOwner),
                )
            // Lobby C: a different anon session. Should NOT be touched.
            val lobbyC = waitingLobby(id = LobbyId.generate(), owner = sessionB)
            repo.save(lobbyA)
            repo.save(lobbyB)
            repo.save(lobbyC)

            val touched = withConn { conn -> repo.rebindAnonSeats(conn, sessionA, userId, Pseudonym("Isho")) }

            assertThat(touched).isEqualTo(setOf(lobbyA.id))
            val afterA = repo.findById(lobbyA.id)!!
            val seatA = afterA.players[sessionA]!!
            assertThat(seatA.userId).isEqualTo(userId)
            assertThat(seatA.pseudonym).isEqualTo(Pseudonym("Isho"))
            // Already-authed seat is untouched: pseudonym + userId unchanged.
            val afterB = repo.findById(lobbyB.id)!!
            assertThat(afterB.players[sessionA]!!.pseudonym).isEqualTo(Pseudonym("Alice"))
            assertThat(afterB.players[sessionA]!!.userId).isEqualTo(userId)
        }

    @Test
    fun `rebindAnonSeats is idempotent - second call returns empty set`() =
        runTest {
            val userId = UserId("11111111-1111-1111-1111-111111111111")
            val lobby = waitingLobby(id = LobbyId.generate(), owner = sessionA)
            repo.save(lobby)

            val first = withConn { conn -> repo.rebindAnonSeats(conn, sessionA, userId, Pseudonym("Isho")) }
            val second = withConn { conn -> repo.rebindAnonSeats(conn, sessionA, userId, Pseudonym("Isho")) }

            assertThat(first).isEqualTo(setOf(lobby.id))
            assertThat(second).isEmpty()
        }

    @Test
    fun `unbindUserSeats reverts authed seats back to anon and returns touched lobby ids`() =
        runTest {
            val userId = UserId("11111111-1111-1111-1111-111111111111")
            // Lobby A: seat carries userId. Should be unbound.
            val authedSeat = Player(sessionA, Pseudonym("Isho"), baseInstant, userId = userId)
            val lobbyA =
                waitingLobby(id = LobbyId.generate(), owner = sessionA).copy(
                    players = mapOf(sessionA to authedSeat),
                )
            // Lobby B: anon seat with different userId. Should NOT be touched.
            val otherUserId = UserId("22222222-2222-2222-2222-222222222222")
            val otherSeat = Player(sessionB, Pseudonym("Bob"), baseInstant, userId = otherUserId)
            val lobbyB =
                waitingLobby(id = LobbyId.generate(), owner = sessionB).copy(
                    players = mapOf(sessionB to otherSeat),
                )
            // Lobby C: pure-anon seat (null userId). Should NOT be touched.
            val lobbyC = waitingLobby(id = LobbyId.generate(), owner = sessionC)
            repo.save(lobbyA)
            repo.save(lobbyB)
            repo.save(lobbyC)

            val touched = withConn { conn -> repo.unbindUserSeats(conn, userId, Pseudonym("Marmotte")) }

            assertThat(touched).isEqualTo(setOf(lobbyA.id))
            val afterA = repo.findById(lobbyA.id)!!
            val seatA = afterA.players[sessionA]!!
            assertThat(seatA.userId).isEqualTo(null)
            assertThat(seatA.pseudonym).isEqualTo(Pseudonym("Marmotte"))
            // Other user's seat is untouched.
            val afterB = repo.findById(lobbyB.id)!!
            assertThat(afterB.players[sessionB]!!.userId).isEqualTo(otherUserId)
            assertThat(afterB.players[sessionB]!!.pseudonym).isEqualTo(Pseudonym("Bob"))
        }

    @Test
    fun `unbindUserSeats is idempotent - second call returns empty set`() =
        runTest {
            val userId = UserId("11111111-1111-1111-1111-111111111111")
            val authedSeat = Player(sessionA, Pseudonym("Isho"), baseInstant, userId = userId)
            val lobby =
                waitingLobby(id = LobbyId.generate(), owner = sessionA).copy(
                    players = mapOf(sessionA to authedSeat),
                )
            repo.save(lobby)

            val first = withConn { conn -> repo.unbindUserSeats(conn, userId, Pseudonym("Marmotte")) }
            val second = withConn { conn -> repo.unbindUserSeats(conn, userId, Pseudonym("Marmotte")) }

            assertThat(first).isEqualTo(setOf(lobby.id))
            assertThat(second).isEmpty()
        }

    @Test
    fun `anonymizeUserSeats clears userId and replaces pseudonym, returns touched lobby ids`() =
        runTest {
            val userId = UserId("33333333-3333-3333-3333-333333333333")
            val authedSeat = Player(sessionA, Pseudonym("Alice"), baseInstant, userId = userId)
            val lobby =
                waitingLobby(id = LobbyId.generate(), owner = sessionA).copy(
                    players = mapOf(sessionA to authedSeat),
                )
            repo.save(lobby)

            val replacement = Pseudonym("Joueur supprime")
            val touched = withConn { conn -> repo.anonymizeUserSeats(conn, userId, replacement) }

            assertThat(touched).isEqualTo(setOf(lobby.id))
            val seat = repo.findById(lobby.id)!!.players[sessionA]!!
            assertThat(seat.userId).isNull()
            assertThat(seat.pseudonym).isEqualTo(replacement)
        }

    @Test
    fun `anonymizeUserSeats is idempotent - second call on already-anon seat returns empty set`() =
        runTest {
            val userId = UserId("33333333-3333-3333-3333-333333333333")
            val authedSeat = Player(sessionA, Pseudonym("Alice"), baseInstant, userId = userId)
            val lobby =
                waitingLobby(id = LobbyId.generate(), owner = sessionA).copy(
                    players = mapOf(sessionA to authedSeat),
                )
            repo.save(lobby)

            val replacement = Pseudonym("Joueur supprime")
            val first = withConn { conn -> repo.anonymizeUserSeats(conn, userId, replacement) }
            val second = withConn { conn -> repo.anonymizeUserSeats(conn, userId, replacement) }

            assertThat(first).isEqualTo(setOf(lobby.id))
            assertThat(second).isEmpty()
        }

    @Test
    fun `refreshUserPseudonym updates pseudonym and returns touched ids`() =
        runTest {
            val userId = UserId("44444444-4444-4444-4444-444444444444")
            val authedSeat = Player(sessionA, Pseudonym("Isho"), baseInstant, userId = userId)
            val lobby =
                waitingLobby(id = LobbyId.generate(), owner = sessionA).copy(
                    players = mapOf(sessionA to authedSeat),
                )
            repo.save(lobby)

            val newPseudonym = Pseudonym("IshoRenamed")
            val touched = withConn { conn -> repo.refreshUserPseudonym(conn, userId, newPseudonym) }

            assertThat(touched).isEqualTo(setOf(lobby.id))
            val seat = repo.findById(lobby.id)!!.players[sessionA]!!
            assertThat(seat.userId).isEqualTo(userId)
            assertThat(seat.pseudonym).isEqualTo(newPseudonym)
        }

    @Test
    fun `refreshUserPseudonym is idempotent - seat already on new pseudonym returns empty set`() =
        runTest {
            val userId = UserId("44444444-4444-4444-4444-444444444444")
            val authedSeat = Player(sessionA, Pseudonym("Isho"), baseInstant, userId = userId)
            val lobby =
                waitingLobby(id = LobbyId.generate(), owner = sessionA).copy(
                    players = mapOf(sessionA to authedSeat),
                )
            repo.save(lobby)

            val newPseudonym = Pseudonym("IshoRenamed")
            val first = withConn { conn -> repo.refreshUserPseudonym(conn, userId, newPseudonym) }
            val second = withConn { conn -> repo.refreshUserPseudonym(conn, userId, newPseudonym) }

            assertThat(first).isEqualTo(setOf(lobby.id))
            assertThat(second).isEmpty()
        }

    @Test
    fun `save persists user_id and findById round-trips it`() =
        runTest {
            val userId = UserId("11111111-1111-1111-1111-111111111111")
            val authedSeat = Player(sessionA, Pseudonym("Isho"), baseInstant, userId = userId)
            val lobby =
                waitingLobby(id = LobbyId.generate(), owner = sessionA).copy(
                    players = mapOf(sessionA to authedSeat),
                )
            repo.save(lobby)

            val loaded = repo.findById(lobby.id)!!

            assertThat(loaded.players[sessionA]!!.userId).isEqualTo(userId)
        }

    @Test
    fun `concurrent mutate calls serialize via FOR UPDATE without lost updates`() {
        // runBlocking on the JVM dispatcher so the two `async` blocks land on
        // distinct OS threads — runTest's virtual scheduler would serialize them.
        runBlocking {
            val lobby = waitingLobby(id = LobbyId.generate(), owner = sessionA)
            repo.save(lobby)

            val bob = Player(sessionB, Pseudonym("Bob"), baseInstant.plusSeconds(10))
            val carol = Player(sessionC, Pseudonym("Carol"), baseInstant.plusSeconds(20))

            coroutineScope {
                val a =
                    async(Dispatchers.IO) {
                        repo.mutate(lobby.id) { current ->
                            // Tiny sleep widens the window in which a non-FOR-UPDATE
                            // implementation would lose an update.
                            Thread.sleep(50)
                            current.copy(players = current.players + (sessionB to bob))
                        }
                    }
                val b =
                    async(Dispatchers.IO) {
                        repo.mutate(lobby.id) { current ->
                            Thread.sleep(50)
                            current.copy(players = current.players + (sessionC to carol))
                        }
                    }
                awaitAll(a, b)
            }

            val loaded = repo.findById(lobby.id)
            assertThat(loaded).isNotNull()
            assertThat(loaded!!.players.keys).containsAtLeast(sessionA, sessionB, sessionC)
            assertThat(loaded.players).hasSize(3)
        }
    }

    // ---- fixtures ------------------------------------------------------

    private fun waitingLobby(
        id: LobbyId,
        owner: SessionId = sessionA,
        ownerUserId: UserId? = null,
        lastActivityAt: Instant = baseInstant,
    ): Lobby {
        val ownerPlayer = Player(owner, Pseudonym("Alice"), baseInstant, userId = ownerUserId)
        return Lobby(
            id = id,
            ownerSessionId = owner,
            ownerUserId = ownerUserId,
            players = mapOf(owner to ownerPlayer),
            state = LobbyLifecycleState.WAITING,
            gridConfig = GridConfig(10, 10),
            game = null,
            lastActivityAt = lastActivityAt,
            code = LobbyCode.generate(),
            title = LobbyTitle("Partie test"),
        )
    }

    private fun inProgressLobby(
        id: LobbyId,
        owner: SessionId = sessionA,
        ownerUserId: UserId? = null,
    ): Lobby {
        val ownerPlayer = Player(owner, Pseudonym("Alice"), baseInstant, userId = ownerUserId)
        val puzzle = samplePuzzle()
        val entries =
            mapOf(
                Position(0, 0) to CellEntry(owner, Letter('B'), baseInstant.plusSeconds(5)),
                Position(0, 1) to CellEntry(owner, Letter('L'), baseInstant.plusSeconds(6)),
            )
        return Lobby(
            id = id,
            ownerSessionId = owner,
            ownerUserId = ownerUserId,
            players = mapOf(owner to ownerPlayer),
            state = LobbyLifecycleState.IN_PROGRESS,
            gridConfig = GridConfig(puzzle.width, puzzle.height),
            game =
                GameSession(
                    puzzle = puzzle,
                    entries = entries,
                    startedAt = baseInstant,
                    completedAt = null,
                    lockedPositions = mapOf(Position(0, 0) to owner),
                ),
            lastActivityAt = baseInstant.plusSeconds(60),
            code = LobbyCode.generate(),
            title = LobbyTitle("Vendredi 11 mai"),
        )
    }

    private fun completedLobby(
        id: LobbyId,
        owner: SessionId = sessionA,
    ): Lobby {
        val base = inProgressLobby(id, owner)
        val completedAt = baseInstant.plusSeconds(3600)
        return base.copy(
            state = LobbyLifecycleState.COMPLETED,
            game = base.game!!.copy(completedAt = completedAt),
        )
    }

    // Pre-ADR-0086 write: lockedPositions entry has no lockedBy key (owner was never persisted).
    private fun legacyPayloadWithoutLockedBy(): String =
        """
        {
          "puzzle": {
            "id": "0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5b00",
            "title": "Legacy",
            "language": "fr",
            "width": 5,
            "height": 5,
            "cells": [],
            "clues": [],
            "createdAt": "2026-05-11T09:58:00Z"
          },
          "startedAt": "2026-05-11T10:00:00Z",
          "lockedPositions": [ { "row": 0, "column": 0 } ]
        }
        """.trimIndent()

    private fun insertLegacyLobbyRow(
        id: LobbyId,
        ownerUserId: UserId,
        payloadJson: String,
    ) {
        dataSource.connection.use { conn ->
            conn
                .prepareStatement(
                    "INSERT INTO lobbies (id, code, owner_session_id, owner_user_id, state, " +
                        "grid_width, grid_height, game_payload, last_activity_at) " +
                        "VALUES (?, ?, ?, ?, 'IN_PROGRESS', 5, 5, CAST(? AS jsonb), ?)",
                ).use { ps ->
                    ps.setString(1, id.value)
                    ps.setString(2, LobbyCode.generate().value)
                    ps.setObject(3, UUID.fromString(sessionA.value))
                    ps.setObject(4, UUID.fromString(ownerUserId.value))
                    ps.setString(5, payloadJson)
                    ps.setTimestamp(6, Timestamp.from(baseInstant))
                    ps.executeUpdate()
                }
        }
    }

    private fun samplePuzzle(): GamePuzzle {
        val clueId = UUID.fromString("00000000-0000-7000-8000-000000000001")
        return GamePuzzle(
            id = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5b00"),
            title = "Sample",
            language = "fr",
            width = 5,
            height = 5,
            cells =
                listOf(
                    LetterCell(Position(0, 0), Letter('B')),
                    LetterCell(Position(0, 1), Letter('L')),
                    BlockCell(Position(1, 0)),
                    DefinitionCell(
                        Position(2, 0),
                        clues =
                            listOf(
                                GameDefinitionClue(clueId, "Definition text", GameArrow.RIGHT),
                            ),
                    ),
                ),
            clues =
                listOf(
                    GameClue(
                        id = clueId,
                        direction = GameClueDirection.ACROSS,
                        start = Position(0, 0),
                        length = 2,
                        text = "Across clue",
                    ),
                ),
            createdAt = baseInstant.minusSeconds(120),
        )
    }

    private suspend fun <T> withConn(block: suspend (Connection) -> T): T =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.autoCommit = false
                try {
                    val result = block(conn)
                    conn.commit()
                    result
                } catch (t: Throwable) {
                    conn.rollback()
                    throw t
                }
            }
        }

    private suspend fun countChildRows(
        table: String,
        id: LobbyId,
    ): Int =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement("SELECT COUNT(*) FROM $table WHERE lobby_id = ?").use { ps ->
                    ps.setString(1, id.value)
                    ps.executeQuery().use { rs ->
                        rs.next()
                        rs.getInt(1)
                    }
                }
            }
        }
}
