package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNull
import com.bliss.grid.application.correction.BackfillStatus
import com.bliss.grid.application.correction.GuardedRecord
import com.bliss.grid.domain.correction.ClueCorrection
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
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CyclicBarrier

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PostgresCorrectionRepositoryTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var repository: PostgresCorrectionRepository

    private val maintainer = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6d")

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
        repository = PostgresCorrectionRepository(dataSource)
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
            conn.createStatement().use { it.executeUpdate("TRUNCATE clue_corrections") }
        }
    }

    @Test
    fun `record persists a replace and progress reports the initial pending state`() {
        val id =
            repository.record(
                ClueCorrection(
                    ClueCorrection.Kind.REPLACE,
                    oldClueText = "Capitale",
                    wordText = "PARIS",
                    newClueText = "Capitale de la France",
                ),
                maintainer,
            )

        val progress = repository.progress(id)!!
        assertThat(progress.correctionId).isEqualTo(id)
        assertThat(progress.kind).isEqualTo(ClueCorrection.Kind.REPLACE)
        assertThat(progress.backfillStatus).isEqualTo(BackfillStatus.PENDING)
        assertThat(progress.gridsMatched).isNull()
        assertThat(progress.gridsPatched).isEqualTo(0)
    }

    @Test
    fun `active returns non-exported corrections and omits exported ones`() {
        val kept =
            repository.record(
                ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "A", newClueText = "B"),
                maintainer,
            )
        val exported =
            repository.record(
                ClueCorrection(ClueCorrection.Kind.FORBID_CLUE, oldClueText = "C"),
                maintainer,
            )
        markExported(exported)

        val active = repository.active()
        assertThat(active.map { it.oldClueText }).containsExactlyInAnyOrder("A")
        assertThat(repository.progress(kept)!!.kind).isEqualTo(ClueCorrection.Kind.REPLACE)
    }

    @Test
    fun `active returns corrections oldest-to-newest so the overlay supersedes with the newest`() {
        repository.record(ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "K", newClueText = "V1"), maintainer)
        repository.record(ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "K", newClueText = "V2"), maintainer)

        assertThat(repository.active().map { it.newClueText }).containsExactly("V1", "V2")
    }

    @Test
    fun `guarded forbid records when the word keeps a clue and rejects the next one that empties it`() {
        val first = repository.recordForbidGuarded(forbid("Verbe etre"), maintainer, emptiesEst("Verbe etre"))
        val second = repository.recordForbidGuarded(forbid("Point cardinal"), maintainer, emptiesEst("Point cardinal"))

        assertThat(first).isInstanceOf(GuardedRecord.Recorded::class)
        assertThat(second).isEqualTo(GuardedRecord.LastClueForbidden)
        assertThat(repository.active().map { it.oldClueText }).containsExactly("Verbe etre")
    }

    @Test
    fun `two concurrent forbids on the same word's two clues let exactly one win`() {
        val barrier = CyclicBarrier(2)
        val results = ConcurrentLinkedQueue<GuardedRecord>()
        val clues = listOf("Verbe etre", "Point cardinal")
        val threads =
            clues.map { clue ->
                Thread {
                    barrier.await()
                    results += repository.recordForbidGuarded(forbid(clue), maintainer, emptiesEst(clue))
                }
            }
        threads.forEach { it.start() }
        threads.forEach { it.join() }

        assertThat(results.count { it is GuardedRecord.Recorded }).isEqualTo(1)
        assertThat(results.count { it == GuardedRecord.LastClueForbidden }).isEqualTo(1)
        assertThat(repository.active().size).isEqualTo(1)
    }

    @Test
    fun `progress is null for an unknown id`() {
        assertThat(repository.progress(UUID.randomUUID())).isNull()
    }

    private fun forbid(oldClueText: String): ClueCorrection =
        ClueCorrection(ClueCorrection.Kind.FORBID_CLUE, oldClueText = oldClueText, wordText = "EST")

    // Models the corpus word EST={Verbe etre, Point cardinal}: forbidding [newForbid] empties it only once
    // every base clue is dropped by the active forbids read in-txn — the same predicate the use case folds.
    private fun emptiesEst(newForbid: String): (List<ClueCorrection>) -> Boolean =
        { active ->
            val base = setOf("Verbe etre", "Point cardinal")
            val forbidden = active.filter { it.kind == ClueCorrection.Kind.FORBID_CLUE }.map { it.oldClueText } + newForbid
            (base - forbidden.toSet()).isEmpty()
        }

    private fun markExported(id: UUID) {
        dataSource.connection.use { conn ->
            conn.prepareStatement("UPDATE clue_corrections SET exported_at = now() WHERE correction_id = ?").use { stmt ->
                stmt.setObject(1, id)
                stmt.executeUpdate()
            }
        }
    }
}
