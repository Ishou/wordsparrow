package com.bliss.survey.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import assertk.assertions.isTrue
import com.bliss.survey.domain.model.PlayerReport
import com.bliss.survey.domain.model.ReportId
import com.bliss.survey.domain.model.ReportReason
import com.bliss.survey.domain.model.ReportStatus
import com.bliss.survey.domain.model.ReportSurface
import com.bliss.survey.domain.model.UserId
import com.zaxxer.hikari.HikariDataSource
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import java.time.Instant
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PgSignalementRepositoryTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var reports: PgSignalementRepository

    private val now: Instant = Instant.parse("2026-07-11T10:00:00Z")

    @BeforeAll
    fun startPostgres() {
        assumeTrue(DockerClientFactory.instance().isDockerAvailable()) { "Docker daemon not available" }
        pg = SurveyTestcontainer.startPostgres()
        dataSource = SurveyTestcontainer.dataSourceFor(pg)
    }

    @AfterAll
    fun stopPostgres() {
        if (::dataSource.isInitialized) dataSource.close()
        if (::pg.isInitialized) pg.stop()
    }

    @BeforeEach
    fun freshRepo() {
        if (!::dataSource.isInitialized) return
        reports = PgSignalementRepository(dataSource)
    }

    @AfterEach
    fun truncate() {
        if (::dataSource.isInitialized) SurveyTestcontainer.truncateAll(dataSource)
    }

    private fun report(
        id: ReportId = ReportId(UUID.randomUUID()),
        reason: ReportReason = ReportReason.ERREUR_SENS,
        reporterId: UserId? = UserId(UUID.randomUUID()),
        status: ReportStatus = ReportStatus.PENDING,
        wordText: String? = "chat",
        clueText: String = "Petit felin",
        puzzleId: UUID? = UUID.randomUUID(),
        createdAt: Instant = now,
    ): PlayerReport =
        PlayerReport(
            id = id,
            wordText = wordText,
            clueText = clueText,
            reason = reason,
            note = "note libre",
            puzzleId = puzzleId,
            surface = ReportSurface.SOLO,
            reporterId = reporterId,
            status = status,
            createdAt = createdAt,
        )

    @Test
    fun `insert and findById round-trips`() =
        runTest {
            val r = report()
            reports.insert(r)
            assertThat(reports.findById(r.id)).isEqualTo(r)
        }

    @Test
    fun `insert an anonymous report round-trips`() =
        runTest {
            val r = report(reporterId = null)
            reports.insert(r)
            assertThat(reports.findById(r.id)?.reporterId).isNull()
        }

    @Test
    fun `findExisting returns the report id for a matching reporter clue and puzzle`() =
        runTest {
            val userId = UserId(UUID.randomUUID())
            val pid = UUID.randomUUID()
            val r = report(reporterId = userId, clueText = "Meilleur ami", puzzleId = pid)
            reports.insert(r)
            assertThat(reports.findExisting(userId, "Meilleur ami", pid)).isEqualTo(r.id)
            assertThat(reports.findExisting(userId, "autre def", pid)).isNull()
        }

    @Test
    fun `findExisting returns null when puzzleId is null`() =
        runTest {
            val userId = UserId(UUID.randomUUID())
            reports.insert(report(reporterId = userId, clueText = "Sans puzzle", puzzleId = null))
            assertThat(reports.findExisting(userId, "Sans puzzle", null)).isNull()
        }

    @Test
    fun `insert a report with no solved word round-trips`() =
        runTest {
            val r = report(wordText = null)
            reports.insert(r)
            assertThat(reports.findById(r.id)?.wordText).isNull()
        }

    @Test
    fun `listPending returns only pending reports ordered by createdAt`() =
        runTest {
            val older = report(status = ReportStatus.PENDING, createdAt = now)
            val newer = report(status = ReportStatus.PENDING, createdAt = now.plusSeconds(60))
            val dismissed = report(status = ReportStatus.DISMISSED)
            reports.insert(newer)
            reports.insert(older)
            reports.insert(dismissed)
            val pending = reports.listPending()
            assertThat(pending).hasSize(2)
            assertThat(pending.map { it.id }).containsExactly(older.id, newer.id)
        }

    @Test
    fun `updateStatus records the triage metadata`() =
        runTest {
            val r = report()
            reports.insert(r)
            val triager = UserId(UUID.randomUUID())
            val at = now.plusSeconds(120)
            reports.updateStatus(r.id, ReportStatus.ACTIONED, triager, at)
            val back = reports.findById(r.id)
            assertThat(back).isNotNull()
            assertThat(back?.status).isEqualTo(ReportStatus.ACTIONED)
            assertThat(back?.triagedBy).isEqualTo(triager)
            assertThat(back?.triagedAt).isEqualTo(at)
        }

    @Test
    fun `anonymiseForUser nulls the reporter id`() =
        runTest {
            val userId = UserId(UUID.randomUUID())
            val r = report(reporterId = userId)
            reports.insert(r)
            reports.anonymiseForUser(userId)
            assertThat(reports.findById(r.id)?.reporterId).isNull()
        }

    @Test
    fun `duplicate authenticated report hits the unique index and returns false, not a raw error`() =
        runTest {
            val userId = UserId(UUID.randomUUID())
            val pid = UUID.randomUUID()
            val first = reports.insert(report(reporterId = userId, clueText = "Predateur", puzzleId = pid))
            val second = reports.insert(report(reporterId = userId, clueText = "Predateur", puzzleId = pid))
            assertThat(first).isTrue()
            assertThat(second).isFalse()
            assertThat(reports.listPending()).hasSize(1)
        }

    @Test
    fun `authenticated reports with a null puzzle are not deduplicated`() =
        runTest {
            val userId = UserId(UUID.randomUUID())
            reports.insert(report(reporterId = userId, clueText = "Sans puzzle", puzzleId = null))
            val second = reports.insert(report(reporterId = userId, clueText = "Sans puzzle", puzzleId = null))
            assertThat(second).isTrue()
            assertThat(reports.listPending()).hasSize(2)
        }

    @Test
    fun `anonymous duplicates are not deduplicated`() =
        runTest {
            val pid = UUID.randomUUID()
            reports.insert(report(reporterId = null, clueText = "Plantigrade", puzzleId = pid))
            val second = reports.insert(report(reporterId = null, clueText = "Plantigrade", puzzleId = pid))
            assertThat(second).isTrue()
            assertThat(reports.listPending()).hasSize(2)
        }
}
