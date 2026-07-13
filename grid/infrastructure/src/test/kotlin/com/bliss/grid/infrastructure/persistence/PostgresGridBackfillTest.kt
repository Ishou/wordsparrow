package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isNotNull
import com.bliss.grid.application.puzzle.StoredPuzzle
import com.bliss.grid.domain.correction.ClueCorrection
import com.bliss.grid.domain.model.Column
import com.bliss.grid.domain.model.Direction
import com.bliss.grid.domain.model.Grid
import com.bliss.grid.domain.model.Position
import com.bliss.grid.domain.model.Row
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordClue
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
class PostgresGridBackfillTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var puzzles: PostgresPuzzleRepository
    private lateinit var backfill: PostgresGridBackfill

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
        backfill = PostgresGridBackfill(dataSource)
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
    fun `replace converges over batches, preserves puzzle_id, and round-trips the payload`() {
        val ids = (1..3).map { UUID.randomUUID() }
        ids.forEach { seed(it, Word("PAIN", "Souffrance")) }
        val correction =
            ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "Souffrance", wordText = "PAIN", newClueText = "Aliment de base")

        assertThat(backfill.countMatching(correction)).isEqualTo(3)
        assertThat(backfill.patchBatch(correction, 2).patched).isEqualTo(2)
        assertThat(backfill.countMatching(correction)).isEqualTo(1)
        assertThat(backfill.patchBatch(correction, 2).patched).isEqualTo(1)
        assertThat(backfill.countMatching(correction)).isEqualTo(0)
        assertThat(backfill.patchBatch(correction, 2).patched).isEqualTo(0)

        ids.forEach { id ->
            val stored = puzzles.get(id)
            assertThat(stored).isNotNull()
            assertThat(
                stored!!
                    .grid.placements
                    .single()
                    .chosenClue.text,
            ).isEqualTo("Aliment de base")
        }
    }

    @Test
    fun `forbid re-picks a surviving clue for the word`() {
        val id = UUID.randomUUID()
        seed(id, Word("EST", listOf(WordClue("Verbe etre"), WordClue("Point cardinal", theme = "compass"))))
        val correction = ClueCorrection(ClueCorrection.Kind.FORBID_CLUE, oldClueText = "Verbe etre", wordText = "EST")

        assertThat(backfill.countMatching(correction)).isEqualTo(1)
        assertThat(backfill.patchBatch(correction, 10).patched).isEqualTo(1)
        assertThat(backfill.countMatching(correction)).isEqualTo(0)

        assertThat(
            puzzles
                .get(id)!!
                .grid.placements
                .single()
                .chosenClue.text,
        ).isEqualTo("Point cardinal")
    }

    @Test
    fun `patchBatch reports the puzzle_date of patched dailies and omits dateless solos`() {
        val dailyId = UUID.randomUUID()
        val soloId = UUID.randomUUID()
        val date = LocalDate.of(2026, 7, 12)
        seedDaily(dailyId, date, Word("PAIN", "Souffrance"))
        seed(soloId, Word("PAIN", "Souffrance"))
        val correction =
            ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "Souffrance", wordText = "PAIN", newClueText = "Aliment de base")

        val result = backfill.patchBatch(correction, 10)

        assertThat(result.patched).isEqualTo(2)
        // Only the daily contributes a date; the dateless solo does not (edge cache is keyed by daily date, ADR-0089 §5).
        assertThat(result.patchedDates).containsExactlyInAnyOrder(date)
    }

    @Test
    fun `patchBatch reports no dates when a no-op correction patches nothing`() {
        seedDaily(UUID.randomUUID(), LocalDate.of(2026, 7, 12), Word("PAIN", "Souffrance"))
        val correction =
            ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "Souffrance", wordText = "PAIN", newClueText = "Souffrance")

        val result = backfill.patchBatch(correction, 10)

        assertThat(result.patched).isEqualTo(0)
        assertThat(result.patchedDates).isEmpty()
    }

    @Test
    fun `a correction narrowed to a different word matches nothing`() {
        seed(UUID.randomUUID(), Word("PARIS", "Capitale"))
        val correction =
            ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "Capitale", wordText = "LYON", newClueText = "Autre")

        assertThat(backfill.countMatching(correction)).isEqualTo(0)
    }

    private fun seed(
        puzzleId: UUID,
        word: Word,
    ) {
        puzzles.getOrCompute(puzzleId) { storedOf(word) }
    }

    private fun seedDaily(
        puzzleId: UUID,
        date: LocalDate,
        word: Word,
    ) {
        puzzles.insertDaily(puzzleId, date, storedOf(word))
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
