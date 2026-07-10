package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isTrue
import com.bliss.grid.application.puzzle.StoredPuzzle
import com.bliss.grid.application.puzzle.VerifyCooldownCalculator
import com.bliss.grid.domain.model.Column
import com.bliss.grid.domain.model.Direction
import com.bliss.grid.domain.model.Grid
import com.bliss.grid.domain.model.Position
import com.bliss.grid.domain.model.Row
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordPlacement
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
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
import java.time.Instant
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PostgresVerifyUsageRepositoryTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var puzzles: PostgresPuzzleRepository
    private lateinit var verifyUsage: PostgresVerifyUsageRepository

    private val now = Instant.parse("2026-06-30T12:00:00Z")

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
            .locations("classpath:db/migration")
            .load()
            .migrate()
        puzzles = PostgresPuzzleRepository(dataSource)
        verifyUsage = PostgresVerifyUsageRepository(dataSource)
    }

    @AfterAll
    fun stopPostgres() {
        if (::dataSource.isInitialized) dataSource.close()
        if (::pg.isInitialized) pg.stop()
    }

    @BeforeEach
    fun cleanTables() {
        if (!::dataSource.isInitialized) return
        dataSource.connection.use { conn ->
            conn.createStatement().use { it.executeUpdate("TRUNCATE puzzles CASCADE") }
        }
    }

    @Test
    fun `first record for a puzzle and user succeeds with a full cooldown`() {
        val (puzzleId, userId) = setup()
        dataSource.connection.use { conn ->
            assertThat(verifyUsage.tryRecord(conn, puzzleId, userId, now))
                .isEqualTo(VerifyCooldownCalculator.Result(true, VerifyCooldownCalculator.COOLDOWN_SECONDS))
        }
    }

    @Test
    fun `second record inside the cooldown is rejected without overwriting the row`() {
        val (puzzleId, userId) = setup()
        dataSource.connection.use { conn ->
            verifyUsage.tryRecord(conn, puzzleId, userId, now)
            val rejected = verifyUsage.tryRecord(conn, puzzleId, userId, now.plusSeconds(60))
            assertThat(rejected.allowed).isEqualTo(false)
            assertThat(rejected.secondsUntilNextVerify).isEqualTo(VerifyCooldownCalculator.COOLDOWN_SECONDS - 60)
        }
        assertThat(verifyUsage.cooldownFor(puzzleId, userId, now.plusSeconds(60)).allowed).isEqualTo(false)
    }

    @Test
    fun `record succeeds again once the cooldown has fully elapsed`() {
        val (puzzleId, userId) = setup()
        dataSource.connection.use { conn ->
            verifyUsage.tryRecord(conn, puzzleId, userId, now)
        }
        val later = now.plusSeconds(VerifyCooldownCalculator.COOLDOWN_SECONDS)
        dataSource.connection.use { conn ->
            assertThat(verifyUsage.tryRecord(conn, puzzleId, userId, later).allowed).isTrue()
        }
    }

    @Test
    fun `deleteByUser removes every row for the user only and is idempotent`() {
        val (puzzleId, userA) = setup()
        val userB = UUID.randomUUID()
        dataSource.connection.use { conn ->
            verifyUsage.tryRecord(conn, puzzleId, userA, now)
            verifyUsage.tryRecord(conn, puzzleId, userB, now)
        }
        assertThat(verifyUsage.deleteByUser(userA)).isEqualTo(1)
        // userA's row is gone so cooldownFor reads no prior verification; userB's row persists.
        assertThat(verifyUsage.cooldownFor(puzzleId, userA, now).allowed).isTrue()
        assertThat(verifyUsage.cooldownFor(puzzleId, userB, now).allowed).isEqualTo(false)
        assertThat(verifyUsage.deleteByUser(userA)).isEqualTo(0)
    }

    private fun setup(): Pair<UUID, UUID> {
        val puzzleId = UUID.randomUUID()
        val grid =
            Grid.fromPlacements(
                width = 3,
                height = 3,
                placements =
                    listOf(
                        WordPlacement(
                            Word(text = "OR", definition = "metal"),
                            Position(Row(0), Column(0)),
                            Direction.RIGHT,
                        ),
                    ),
            )
        val stored = StoredPuzzle(grid, "T", "fr", 3, Instant.parse("2026-04-24T15:30:00Z"))
        puzzles.getOrCompute(puzzleId) { stored }
        return puzzleId to UUID.randomUUID()
    }
}
