package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isGreaterThanOrEqualTo
import assertk.assertions.isNull
import com.bliss.grid.application.puzzle.HintBudgetCalculator
import com.bliss.grid.application.puzzle.StoredPuzzle
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
import java.sql.Connection
import java.time.Duration
import java.time.Instant
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PostgresHintUsageRepositoryTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var puzzles: PostgresPuzzleRepository
    private lateinit var hintUsage: PostgresHintUsageRepository

    private val now = Instant.parse("2026-06-30T12:00:00Z")
    private val ten = Duration.ofMinutes(10)

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
        hintUsage = PostgresHintUsageRepository(dataSource)
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
    fun `budgetFor on a fresh puzzle and user reports a full bucket`() {
        val (puzzleId, userId) = setup()
        assertThat(hintUsage.budgetFor(puzzleId, userId, 3, ten, now))
            .isEqualTo(HintBudgetCalculator.View(3, null))
    }

    @Test
    fun `three spends drain the bucket to zero then the fourth returns null`() {
        val (puzzleId, userId) = setup()
        withConnection { conn ->
            assertThat(hintUsage.trySpend(conn, puzzleId, userId, 3, ten, now))
                .isEqualTo(HintBudgetCalculator.View(2, 600))
            assertThat(hintUsage.trySpend(conn, puzzleId, userId, 3, ten, now))
                .isEqualTo(HintBudgetCalculator.View(1, 600))
            assertThat(hintUsage.trySpend(conn, puzzleId, userId, 3, ten, now))
                .isEqualTo(HintBudgetCalculator.View(0, 600))
            assertThat(hintUsage.trySpend(conn, puzzleId, userId, 3, ten, now)).isNull()
        }
    }

    @Test
    fun `one token regenerates after the interval elapses`() {
        val (puzzleId, userId) = setup()
        withConnection { conn ->
            repeat(3) { hintUsage.trySpend(conn, puzzleId, userId, 3, ten, now) }
        }
        val later = now.plusSeconds(600)
        assertThat(hintUsage.budgetFor(puzzleId, userId, 3, ten, later))
            .isEqualTo(HintBudgetCalculator.View(1, 600))
        withConnection { conn ->
            assertThat(hintUsage.trySpend(conn, puzzleId, userId, 3, ten, later))
                .isEqualTo(HintBudgetCalculator.View(0, 600))
        }
    }

    @Test
    fun `trySpend keeps separate buckets per user`() {
        val (puzzleId, _) = setup()
        val userA = UUID.randomUUID()
        val userB = UUID.randomUUID()
        withConnection { conn ->
            assertThat(hintUsage.trySpend(conn, puzzleId, userA, 3, ten, now)?.tokensRemaining).isEqualTo(2)
            assertThat(hintUsage.trySpend(conn, puzzleId, userA, 3, ten, now)?.tokensRemaining).isEqualTo(1)
            assertThat(hintUsage.trySpend(conn, puzzleId, userB, 3, ten, now)?.tokensRemaining).isEqualTo(2)
        }
    }

    @Test
    fun `trySpend with capacity zero returns null without inserting`() {
        val (puzzleId, userId) = setup()
        withConnection { conn ->
            assertThat(hintUsage.trySpend(conn, puzzleId, userId, 0, ten, now)).isNull()
        }
        assertThat(hintUsage.budgetFor(puzzleId, userId, 0, ten, now))
            .isEqualTo(HintBudgetCalculator.View(0, null))
    }

    @Test
    fun `deleteByUser blocks while another transaction holds the user advisory lock`() {
        val (puzzleId, userId) = setup()
        withConnection { conn ->
            hintUsage.trySpend(conn, puzzleId, userId, 3, ten, now)
        }
        val holdMillis = 500L
        val holderReleased = java.util.concurrent.CountDownLatch(1)
        val holderStarted = java.util.concurrent.CountDownLatch(1)
        val holder =
            Thread {
                dataSource.connection.use { conn ->
                    conn.autoCommit = false
                    conn.prepareStatement("SELECT pg_advisory_xact_lock(hashtext(?))").use { stmt ->
                        stmt.setString(1, "user:$userId")
                        stmt.execute()
                    }
                    holderStarted.countDown()
                    Thread.sleep(holdMillis)
                    conn.commit()
                    holderReleased.countDown()
                }
            }
        holder.start()
        holderStarted.await()
        val startNs = System.nanoTime()
        val deleted = hintUsage.deleteByUser(userId)
        val elapsedMs = (System.nanoTime() - startNs) / 1_000_000
        holder.join()
        assertThat(deleted).isEqualTo(1)
        // Lock contention forces deleteByUser to wait at least 450ms while the holder thread sleeps 500ms.
        assertThat(elapsedMs).isGreaterThanOrEqualTo(450L)
    }

    @Test
    fun `deleteByUser removes every row for the user and is idempotent`() {
        val (puzzleId, userA) = setup()
        val userB = UUID.randomUUID()
        withConnection { conn ->
            hintUsage.trySpend(conn, puzzleId, userA, 3, ten, now)
            hintUsage.trySpend(conn, puzzleId, userB, 3, ten, now)
        }
        assertThat(hintUsage.deleteByUser(userA)).isEqualTo(1)
        // userA's row is gone so budgetFor reads a full bucket again; userB's spend persists.
        assertThat(hintUsage.budgetFor(puzzleId, userA, 3, ten, now))
            .isEqualTo(HintBudgetCalculator.View(3, null))
        assertThat(hintUsage.budgetFor(puzzleId, userB, 3, ten, now).tokensRemaining).isEqualTo(2)
        // Idempotent: second call deletes nothing.
        assertThat(hintUsage.deleteByUser(userA)).isEqualTo(0)
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

    private fun <T> withConnection(block: (Connection) -> T): T =
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
