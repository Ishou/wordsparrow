package com.bliss.survey.application.usecases

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isNull
import assertk.assertions.isTrue
import com.bliss.survey.domain.model.PlayerReport
import com.bliss.survey.domain.model.ReportId
import com.bliss.survey.domain.model.ReportReason
import com.bliss.survey.domain.model.ReportStatus
import com.bliss.survey.domain.model.ReportSurface
import com.bliss.survey.domain.model.UserId
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class ListSignalementsUseCaseTest {
    private val base = Instant.parse("2026-07-11T10:00:00Z")
    private val viewer = UserId(UUID.fromString("99999999-9999-7999-8999-999999999999"))

    private fun report(
        id: String,
        wordText: String? = "CHAT",
        clueText: String = "Animal qui miaule",
        reason: ReportReason = ReportReason.ERREUR_SENS,
        note: String? = null,
        puzzleId: UUID? = null,
        surface: ReportSurface = ReportSurface.SOLO,
        createdAt: Instant = base,
        status: ReportStatus = ReportStatus.PENDING,
        reporterId: UserId? = null,
    ): PlayerReport =
        PlayerReport(
            id = ReportId(UUID.fromString(id)),
            wordText = wordText,
            clueText = clueText,
            reason = reason,
            note = note,
            puzzleId = puzzleId,
            surface = surface,
            reporterId = reporterId,
            status = status,
            createdAt = createdAt,
        )

    @Test
    fun `groups pending reports by clue and reason with a count`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", createdAt = base)
            reports.reports += report("22222222-2222-7222-8222-222222222222", createdAt = base.plusSeconds(60))

            val groups = ListSignalementsUseCase(reports).execute(viewer)

            assertThat(groups).hasSize(1)
            assertThat(groups.single().count).isEqualTo(2)
            assertThat(groups.single().wordText).isEqualTo("CHAT")
            assertThat(groups.single().reason).isEqualTo(ReportReason.ERREUR_SENS)
        }

    @Test
    fun `emits the surface and puzzleId of the reported group`() =
        runTest {
            val puzzle = UUID.fromString("aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa")
            val reports = InMemorySignalementRepository()
            reports.reports +=
                report(
                    "11111111-1111-7111-8111-111111111111",
                    puzzleId = puzzle,
                    surface = ReportSurface.DAILY,
                )

            val group = ListSignalementsUseCase(reports).execute(viewer).single()

            assertThat(group.surface).isEqualTo(ReportSurface.DAILY)
            assertThat(group.puzzleId).isEqualTo(puzzle)
        }

    @Test
    fun `word-less reports group together and surface a null word`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", wordText = null, createdAt = base)
            reports.reports += report("22222222-2222-7222-8222-222222222222", wordText = null, createdAt = base.plusSeconds(60))

            val group = ListSignalementsUseCase(reports).execute(viewer).single()

            assertThat(group.count).isEqualTo(2)
            assertThat(group.wordText).isNull()
        }

    @Test
    fun `same clue and reason on distinct puzzles are separate groups`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports +=
                report("11111111-1111-7111-8111-111111111111", puzzleId = UUID.fromString("aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa"))
            reports.reports +=
                report("22222222-2222-7222-8222-222222222222", puzzleId = UUID.fromString("bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb"))

            assertThat(ListSignalementsUseCase(reports).execute(viewer)).hasSize(2)
        }

    @Test
    fun `distinct reasons on the same clue are separate groups`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", reason = ReportReason.ERREUR_SENS)
            reports.reports += report("22222222-2222-7222-8222-222222222222", reason = ReportReason.AMBIGU)

            val groups = ListSignalementsUseCase(reports).execute(viewer)

            assertThat(groups).hasSize(2)
        }

    @Test
    fun `representative reportId note and time come from the latest report in the group`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", note = "vieux", createdAt = base)
            val latestId = "22222222-2222-7222-8222-222222222222"
            reports.reports += report(latestId, note = "récent", createdAt = base.plusSeconds(120))

            val group = ListSignalementsUseCase(reports).execute(viewer).single()

            assertThat(group.reportId).isEqualTo(ReportId(UUID.fromString(latestId)))
            assertThat(group.latestNote).isEqualTo("récent")
            assertThat(group.latestAt).isEqualTo(base.plusSeconds(120))
        }

    @Test
    fun `latestNote is null when the latest report carries no note`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", note = null, createdAt = base)

            assertThat(ListSignalementsUseCase(reports).execute(viewer).single().latestNote).isNull()
        }

    @Test
    fun `groups are ordered most recent first`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", clueText = "ancien", createdAt = base)
            reports.reports += report("22222222-2222-7222-8222-222222222222", clueText = "nouveau", createdAt = base.plusSeconds(300))

            val clues = ListSignalementsUseCase(reports).execute(viewer).map { it.clueText }

            assertThat(clues).containsExactly("nouveau", "ancien")
        }

    @Test
    fun `non pending reports are excluded`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", status = ReportStatus.ACTIONED)

            assertThat(ListSignalementsUseCase(reports).execute(viewer)).hasSize(0)
        }

    @Test
    fun `empty pending set yields no groups`() =
        runTest {
            assertThat(ListSignalementsUseCase(InMemorySignalementRepository()).execute(viewer)).hasSize(0)
        }

    @Test
    fun `mine is true when the viewer is among the group reporters`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", reporterId = viewer)
            reports.reports += report("22222222-2222-7222-8222-222222222222", reporterId = null)

            assertThat(ListSignalementsUseCase(reports).execute(viewer).single().mine).isTrue()
        }

    @Test
    fun `mine is false when the group has no report from the viewer`() =
        runTest {
            val other = UserId(UUID.fromString("88888888-8888-7888-8888-888888888888"))
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", reporterId = other)

            assertThat(ListSignalementsUseCase(reports).execute(viewer).single().mine).isFalse()
        }

    @Test
    fun `mine is false for anonymised reports with a null reporter`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", reporterId = null)

            assertThat(ListSignalementsUseCase(reports).execute(viewer).single().mine).isFalse()
        }
}
