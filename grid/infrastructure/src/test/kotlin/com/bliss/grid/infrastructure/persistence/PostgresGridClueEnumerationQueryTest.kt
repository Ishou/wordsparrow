package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.isEmpty
import com.bliss.grid.application.correction.GridClueUsage
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
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PostgresGridClueEnumerationQueryTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var puzzles: PostgresPuzzleRepository
    private lateinit var enumeration: PostgresGridClueEnumerationQuery

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
        enumeration = PostgresGridClueEnumerationQuery(dataSource)
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
    fun `enumerates distinct word and chosen-clue pairs across grids`() {
        puzzles.getOrCompute(UUID.randomUUID()) { storedOf(Word("CHAT", "Animal qui miaule")) }
        puzzles.getOrCompute(UUID.randomUUID()) { storedOf(Word("CHAT", "Animal qui miaule")) }
        puzzles.getOrCompute(UUID.randomUUID()) { storedOf(Word("PARIS", "Capitale")) }

        val rows = enumeration.enumerate(emptySet())

        // The duplicate CHAT pair collapses to one.
        assertThat(rows).containsExactlyInAnyOrder(
            GridClueUsage("CHAT", "Animal qui miaule"),
            GridClueUsage("PARIS", "Capitale"),
        )
    }

    @Test
    fun `a non-empty word filter restricts the enumeration and folds case`() {
        puzzles.getOrCompute(UUID.randomUUID()) { storedOf(Word("CHAT", "Animal qui miaule")) }
        puzzles.getOrCompute(UUID.randomUUID()) { storedOf(Word("PARIS", "Capitale")) }

        val rows = enumeration.enumerate(setOf("chat"))

        assertThat(rows).containsExactlyInAnyOrder(GridClueUsage("CHAT", "Animal qui miaule"))
    }

    @Test
    fun `an unused word yields no rows`() {
        puzzles.getOrCompute(UUID.randomUUID()) { storedOf(Word("PARIS", "Capitale")) }

        assertThat(enumeration.enumerate(setOf("CHAT"))).isEmpty()
    }

    private fun storedOf(word: Word): StoredPuzzle {
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
            createdAt = Instant.parse("2026-05-13T00:00:00Z"),
        )
    }
}
