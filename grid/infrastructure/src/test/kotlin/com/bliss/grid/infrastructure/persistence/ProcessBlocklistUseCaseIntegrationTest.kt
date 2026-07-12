package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNotEqualTo
import assertk.assertions.isNull
import com.bliss.grid.application.correction.BackfillStatus
import com.bliss.grid.application.correction.DailyRegenerationPort
import com.bliss.grid.application.correction.ProcessBlocklistUseCase
import com.bliss.grid.application.puzzle.StoredPuzzle
import com.bliss.grid.domain.correction.ClueCorrection
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
import java.util.concurrent.atomic.AtomicLong

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ProcessBlocklistUseCaseIntegrationTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var puzzles: PostgresPuzzleRepository
    private lateinit var store: PostgresCorrectionRepository
    private lateinit var backfill: PostgresBlocklistBackfill

    private val dateA = LocalDate.parse("2026-07-12")
    private val dateB = LocalDate.parse("2026-07-13")
    private val maintainer = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5aaa")
    private val regenClock = AtomicLong(100)

    // Stands in for EnsureUpcomingDailiesUseCase: appends a fresh-id word-free daily row, latest-wins (ADR-0081).
    private val regeneration =
        DailyRegenerationPort { date ->
            puzzles.insertDaily(UUID.randomUUID(), date, storedOf(Word("PROPRE", "def"), instantAt(regenClock.getAndIncrement())))
            true
        }

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
        store = PostgresCorrectionRepository(dataSource)
        backfill = PostgresBlocklistBackfill(dataSource)
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
            conn.createStatement().use { it.executeUpdate("TRUNCATE puzzles, clue_corrections CASCADE") }
        }
        regenClock.set(100)
    }

    @Test
    fun `scrub regenerates the affected daily, deletes the solo, and leaves unrelated grids untouched`() {
        val originalDailyId = UUID.randomUUID()
        val soloId = UUID.randomUUID()
        val unrelatedDailyId = UUID.randomUUID()
        puzzles.insertDaily(originalDailyId, dateA, storedOf(Word("GROSMOT", "def"), instantAt(1)))
        puzzles.getOrCompute(soloId) { storedOf(Word("GROSMOT", "def"), instantAt(1)) }
        puzzles.insertDaily(unrelatedDailyId, dateB, storedOf(Word("PARIS", "Capitale"), instantAt(1)))

        val correctionId = store.record(ClueCorrection(ClueCorrection.Kind.BLOCKLIST_WORD, wordText = "GROSMOT"), maintainer)
        ProcessBlocklistUseCase(store, backfill, regeneration).scrub(store.backfillJobs().single())

        val current = puzzles.getCurrentForDate(dateA)!!
        assertThat(current.puzzleId).isNotEqualTo(originalDailyId)
        assertThat(
            current.puzzle.grid.placements
                .map { it.word.text },
        ).isEqualTo(listOf("PROPRE"))
        assertThat(puzzles.get(soloId)).isNull()
        assertThat(puzzles.getCurrentForDate(dateB)!!.puzzleId).isEqualTo(unrelatedDailyId)

        val progress = store.progress(correctionId)!!
        assertThat(progress.gridsMatched).isEqualTo(2)
        assertThat(progress.gridsPatched).isEqualTo(2)
        assertThat(progress.backfillStatus).isEqualTo(BackfillStatus.DONE)
        assertThat(backfill.remainingWork("GROSMOT").total).isEqualTo(0)
    }

    @Test
    fun `a second blocklist over the already-scrubbed corpus matches nothing`() {
        puzzles.insertDaily(UUID.randomUUID(), dateA, storedOf(Word("GROSMOT", "def"), instantAt(1)))
        store.record(ClueCorrection(ClueCorrection.Kind.BLOCKLIST_WORD, wordText = "GROSMOT"), maintainer)
        ProcessBlocklistUseCase(store, backfill, regeneration).scrub(store.backfillJobs().single())

        val secondId = store.record(ClueCorrection(ClueCorrection.Kind.BLOCKLIST_WORD, wordText = "GROSMOT"), maintainer)
        ProcessBlocklistUseCase(store, backfill, regeneration).scrub(store.backfillJobs().single { it.correctionId == secondId })

        val progress = store.progress(secondId)!!
        assertThat(progress.gridsMatched).isEqualTo(0)
        assertThat(progress.gridsPatched).isEqualTo(0)
        assertThat(progress.backfillStatus).isEqualTo(BackfillStatus.DONE)
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
