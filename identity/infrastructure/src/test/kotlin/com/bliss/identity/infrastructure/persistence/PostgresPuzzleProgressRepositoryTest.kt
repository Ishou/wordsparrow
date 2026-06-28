package com.bliss.identity.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNull
import com.bliss.identity.application.ports.UpsertOutcome
import com.bliss.identity.domain.progress.PuzzleId
import com.bliss.identity.domain.progress.PuzzleProgress
import com.bliss.identity.domain.user.UserId
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import kotlinx.coroutines.test.runTest
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PostgresPuzzleProgressRepositoryTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var repo: PostgresPuzzleProgressRepository

    private val now: Instant = Instant.parse("2026-06-28T12:00:00Z").truncatedTo(ChronoUnit.MICROS)
    private var userId: UserId = UserId(UUID.randomUUID())
    private val puzzleId = PuzzleId(UUID.randomUUID())

    private fun row(
        payload: String = "{\"k\":1}",
        at: Instant = now,
        puzzle: PuzzleId = puzzleId,
    ) = PuzzleProgress(userId, puzzle, payload, at)

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
                },
            )
        Flyway
            .configure()
            .dataSource(dataSource)
            .table("flyway_schema_history_identity")
            .locations("classpath:db/migration")
            .load()
            .migrate()
    }

    @AfterAll
    fun stopPostgres() {
        if (::dataSource.isInitialized) dataSource.close()
        if (::pg.isInitialized) pg.stop()
    }

    @BeforeEach
    fun freshRepo() {
        if (!::dataSource.isInitialized) return
        repo = PostgresPuzzleProgressRepository(dataSource)
        userId = UserId(UUID.randomUUID())
        seedUser(userId)
    }

    @AfterEach
    fun truncate() {
        if (::dataSource.isInitialized) {
            dataSource.connection.use { conn ->
                conn.prepareStatement("TRUNCATE identity_users CASCADE").use { it.executeUpdate() }
            }
        }
    }

    private fun seedUser(id: UserId) {
        dataSource.connection.use { conn ->
            conn
                .prepareStatement(
                    "INSERT INTO identity_users (user_id, display_name, created_at, last_seen_at, role) " +
                        "VALUES (?, ?, ?, ?, ?)",
                ).use { stmt ->
                    stmt.setObject(1, id.value)
                    stmt.setString(2, "Alice")
                    stmt.setObject(3, now.atOffset(ZoneOffset.UTC))
                    stmt.setObject(4, now.atOffset(ZoneOffset.UTC))
                    stmt.setString(5, "player")
                    stmt.executeUpdate()
                }
        }
    }

    @Test
    fun `find returns null when empty`() =
        runTest {
            assertThat(repo.find(userId, puzzleId)).isNull()
        }

    @Test
    fun `upsert with null base then find round-trips`() =
        runTest {
            val outcome = repo.upsert(row(), expectedUpdatedAt = null)
            assertThat(outcome).isEqualTo(UpsertOutcome.Written(now))
            assertThat(repo.find(userId, puzzleId)?.payload).isEqualTo("{\"k\": 1}")
        }

    @Test
    fun `upsert with null base conflicts when a row exists`() =
        runTest {
            repo.upsert(row(), expectedUpdatedAt = null)
            val outcome = repo.upsert(row(payload = "{\"k\":2}", at = now.plusSeconds(10)), expectedUpdatedAt = null)
            assertThat(outcome).isInstanceOf(UpsertOutcome.Conflict::class)
            assertThat(repo.find(userId, puzzleId)?.updatedAt).isEqualTo(now)
        }

    @Test
    fun `upsert with matching base updates the row`() =
        runTest {
            repo.upsert(row(), expectedUpdatedAt = null)
            val later = now.plusSeconds(30)
            val outcome = repo.upsert(row(payload = "{\"k\":2}", at = later), expectedUpdatedAt = now)
            assertThat(outcome).isEqualTo(UpsertOutcome.Written(later))
            assertThat(repo.find(userId, puzzleId)?.payload).isEqualTo("{\"k\": 2}")
        }

    @Test
    fun `upsert with stale base conflicts and leaves the row untouched`() =
        runTest {
            repo.upsert(row(), expectedUpdatedAt = null)
            val outcome = repo.upsert(row(payload = "{\"k\":2}", at = now.plusSeconds(30)), expectedUpdatedAt = now.minusSeconds(5))
            assertThat(outcome).isInstanceOf(UpsertOutcome.Conflict::class)
            assertThat(repo.find(userId, puzzleId)?.updatedAt).isEqualTo(now)
        }

    @Test
    fun `upsert with non-null base when no row exists conflicts`() =
        runTest {
            val outcome = repo.upsert(row(), expectedUpdatedAt = now)
            assertThat(outcome).isInstanceOf(UpsertOutcome.Conflict::class)
            assertThat(repo.find(userId, puzzleId)).isNull()
        }

    @Test
    fun `findByUser returns only the caller's rows`() =
        runTest {
            val other = UserId(UUID.randomUUID())
            seedUser(other)
            val p1 = PuzzleId(UUID.randomUUID())
            val p2 = PuzzleId(UUID.randomUUID())
            repo.upsert(row(puzzle = p1), expectedUpdatedAt = null)
            repo.upsert(row(puzzle = p2), expectedUpdatedAt = null)
            repo.upsert(PuzzleProgress(other, PuzzleId(UUID.randomUUID()), "{}", now), expectedUpdatedAt = null)
            assertThat(repo.findByUser(userId).map { it.puzzleId }).containsExactlyInAnyOrder(p1, p2)
        }

    @Test
    fun `deleting the user cascades the progress rows`() =
        runTest {
            repo.upsert(row(), expectedUpdatedAt = null)
            dataSource.connection.use { conn ->
                conn.prepareStatement("DELETE FROM identity_users WHERE user_id = ?").use { stmt ->
                    stmt.setObject(1, userId.value)
                    stmt.executeUpdate()
                }
            }
            assertThat(repo.find(userId, puzzleId)).isNull()
        }
}
