package com.bliss.survey.application.usecases

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.bliss.survey.domain.model.PlayerReport
import com.bliss.survey.domain.model.ReportId
import com.bliss.survey.domain.model.ReportReason
import com.bliss.survey.domain.model.ReportStatus
import com.bliss.survey.domain.model.ReportSurface
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class ListSignalementsUseCaseTest {
    private val base = Instant.parse("2026-07-11T10:00:00Z")

    private fun report(
        id: String,
        wordText: String? = "CHAT",
        clueText: String = "Animal qui miaule",
        reason: ReportReason = ReportReason.ERREUR_SENS,
        note: String? = null,
        puzzleId: UUID? = null,
        createdAt: Instant = base,
        status: ReportStatus = ReportStatus.PENDING,
    ): PlayerReport =
        PlayerReport(
            id = ReportId(UUID.fromString(id)),
            wordText = wordText,
            clueText = clueText,
            reason = reason,
            note = note,
            puzzleId = puzzleId,
            surface = ReportSurface.SOLO,
            reporterId = null,
            status = status,
            createdAt = createdAt,
        )

    @Test
    fun `groups pending reports by clue and reason with a count`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", createdAt = base)
            reports.reports += report("22222222-2222-7222-8222-222222222222", createdAt = base.plusSeconds(60))

            val groups = ListSignalementsUseCase(reports).execute()

            assertThat(groups).hasSize(1)
            assertThat(groups.single().count).isEqualTo(2)
            assertThat(groups.single().wordText).isEqualTo("CHAT")
            assertThat(groups.single().reason).isEqualTo(ReportReason.ERREUR_SENS)
        }

    @Test
    fun `word-less reports group together and surface a null word`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", wordText = null, createdAt = base)
            reports.reports += report("22222222-2222-7222-8222-222222222222", wordText = null, createdAt = base.plusSeconds(60))

            val group = ListSignalementsUseCase(reports).execute().single()

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

            assertThat(ListSignalementsUseCase(reports).execute()).hasSize(2)
        }

    @Test
    fun `distinct reasons on the same clue are separate groups`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", reason = ReportReason.ERREUR_SENS)
            reports.reports += report("22222222-2222-7222-8222-222222222222", reason = ReportReason.AMBIGU)

            val groups = ListSignalementsUseCase(reports).execute()

            assertThat(groups).hasSize(2)
        }

    @Test
    fun `representative reportId note and time come from the latest report in the group`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", note = "vieux", createdAt = base)
            val latestId = "22222222-2222-7222-8222-222222222222"
            reports.reports += report(latestId, note = "récent", createdAt = base.plusSeconds(120))

            val group = ListSignalementsUseCase(reports).execute().single()

            assertThat(group.reportId).isEqualTo(ReportId(UUID.fromString(latestId)))
            assertThat(group.latestNote).isEqualTo("récent")
            assertThat(group.latestAt).isEqualTo(base.plusSeconds(120))
        }

    @Test
    fun `latestNote is null when the latest report carries no note`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", note = null, createdAt = base)

            assertThat(ListSignalementsUseCase(reports).execute().single().latestNote).isNull()
        }

    @Test
    fun `groups are ordered most recent first`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", clueText = "ancien", createdAt = base)
            reports.reports += report("22222222-2222-7222-8222-222222222222", clueText = "nouveau", createdAt = base.plusSeconds(300))

            val clues = ListSignalementsUseCase(reports).execute().map { it.clueText }

            assertThat(clues).containsExactly("nouveau", "ancien")
        }

    @Test
    fun `non pending reports are excluded`() =
        runTest {
            val reports = InMemorySignalementRepository()
            reports.reports += report("11111111-1111-7111-8111-111111111111", status = ReportStatus.ACTIONED)

            assertThat(ListSignalementsUseCase(reports).execute()).hasSize(0)
        }

    @Test
    fun `empty pending set yields no groups`() =
        runTest {
            assertThat(ListSignalementsUseCase(InMemorySignalementRepository()).execute()).hasSize(0)
        }
}
