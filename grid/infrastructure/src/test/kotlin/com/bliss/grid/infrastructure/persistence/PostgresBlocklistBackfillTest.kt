package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import assertk.assertions.isTrue
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
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PostgresBlocklistBackfillTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var puzzles: PostgresPuzzleRepository
    private lateinit var backfill: PostgresBlocklistBackfill

    private val dateA = LocalDate.parse("2026-07-12")
    private val dateB = LocalDate.parse("2026-07-13")

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
        backfill = PostgresBlocklistBackfill(dataSource)
    }

    @AfterAll
    fun stopPostgres() {
        if (::dataSource.isInitialized) dataSource.close()
        if (::pg.isInitialized) pg.stop()
    }

    @BeforeEach
    fun cleanTable() {
        if (!::dataSource.isInitialized) return
        dataSource.connection.use { conn ->
            conn.createStatement().use { it.executeUpdate("TRUNCATE puzzles CASCADE") }
        }
    }

    @Test
    fun `remainingWork finds the affected daily date and solo id, ignoring unrelated grids`() {
        val soloId = UUID.randomUUID()
        puzzles.insertDaily(UUID.randomUUID(), dateA, storedOf(Word("GROSMOT", "def"), instantAt(1)))
        puzzles.getOrCompute(soloId) { storedOf(Word("GROSMOT", "def"), instantAt(1)) }
        puzzles.insertDaily(UUID.randomUUID(), dateB, storedOf(Word("PARIS", "Capitale"), instantAt(1)))
        puzzles.getOrCompute(UUID.randomUUID()) { storedOf(Word("LYON", "Ville"), instantAt(1)) }

        val work = backfill.remainingWork("grosmot")

        assertThat(work.dailyDates).containsExactly(dateA)
        assertThat(work.soloIds).containsExactly(soloId)
        assertThat(work.total).isEqualTo(2)
    }

    @Test
    fun `a regenerated daily's newer word-free row drops the date from remainingWork`() {
        puzzles.insertDaily(UUID.randomUUID(), dateA, storedOf(Word("GROSMOT", "def"), instantAt(1)))
        assertThat(backfill.remainingWork("GROSMOT").dailyDates).containsExactly(dateA)

        // Latest-wins: a newer row for the same date without the word (ADR-0081).
        puzzles.insertDaily(UUID.randomUUID(), dateA, storedOf(Word("PROPRE", "def"), instantAt(2)))

        assertThat(backfill.remainingWork("GROSMOT").dailyDates).isEmpty()
    }

    @Test
    fun `deleteSolo removes a solo row and never a daily`() {
        val soloId = UUID.randomUUID()
        val dailyId = UUID.randomUUID()
        puzzles.getOrCompute(soloId) { storedOf(Word("GROSMOT", "def"), instantAt(1)) }
        puzzles.insertDaily(dailyId, dateA, storedOf(Word("GROSMOT", "def"), instantAt(1)))

        assertThat(backfill.deleteSolo(soloId)).isTrue()
        assertThat(backfill.deleteSolo(dailyId)).isFalse()
        assertThat(puzzles.get(soloId)).isNull()
        assertThat(puzzles.get(dailyId)).isNotNull()
    }

    private fun instantAt(seconds: Long): Instant = Instant.parse("2026-05-13T00:00:00Z").plusSeconds(seconds)

    private fun storedOf(
        word: Word,
        createdAt: Instant,
    ): StoredPuzzle {
        val placement =
            WordPlacement(
                word = word,
                cluePosition = Position(Row(0), Column(0)),
                direction = Direction.DOWN_RIGHT,
                chosenClue = word.clues.first(),
            )
        return StoredPuzzle(
            grid = Grid.fromPlacements(width = 12, height = 12, placements = listOf(placement)),
            title = "t",
            language = "fr",
            hintsAllowed = 3,
            createdAt = createdAt,
        )
    }
}
