package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
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
class PostgresCorrectionPreviewQueryTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var puzzles: PostgresPuzzleRepository
    private lateinit var preview: PostgresCorrectionPreviewQuery

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
        preview = PostgresCorrectionPreviewQuery(dataSource)
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
    fun `counts affected dailies and solos by chosen clue text and ignores others`() {
        puzzles.insertDaily(UUID.randomUUID(), LocalDate.parse("2026-07-12"), storedOf(Word("CHAT", "Animal qui miaule")))
        puzzles.getOrCompute(UUID.randomUUID()) { storedOf(Word("CHAT", "Animal qui miaule")) }
        puzzles.getOrCompute(UUID.randomUUID()) { storedOf(Word("PARIS", "Capitale")) }

        val result = preview.preview("Animal qui miaule", "chat")

        assertThat(result.affectedDailies).isEqualTo(1)
        assertThat(result.affectedSolo).isEqualTo(1)
    }

    @Test
    fun `wordText narrows the match when the same clue is shared`() {
        puzzles.getOrCompute(UUID.randomUUID()) { storedOf(Word("CHAT", "Animal domestique")) }
        puzzles.getOrCompute(UUID.randomUUID()) { storedOf(Word("CHIEN", "Animal domestique")) }

        assertThat(preview.preview("Animal domestique", null).affectedSolo).isEqualTo(2)
        assertThat(preview.preview("Animal domestique", "chien").affectedSolo).isEqualTo(1)
    }

    @Test
    fun `a clue in no grid yields zero counts`() {
        puzzles.getOrCompute(UUID.randomUUID()) { storedOf(Word("PARIS", "Capitale")) }

        val result = preview.preview("Animal qui miaule", null)

        assertThat(result.affectedDailies).isEqualTo(0)
        assertThat(result.affectedSolo).isEqualTo(0)
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
