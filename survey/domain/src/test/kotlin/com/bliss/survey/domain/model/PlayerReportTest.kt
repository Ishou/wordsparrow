package com.bliss.survey.domain.model

import assertk.assertFailure
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import assertk.assertions.messageContains
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class PlayerReportTest {
    private fun report(
        wordText: String? = "chat",
        clueText: String = "Petit felin domestique",
        reason: ReportReason = ReportReason.ERREUR_SENS,
        note: String? = null,
        surface: ReportSurface = ReportSurface.SOLO,
        reporterId: UserId? = UserId(UUID.randomUUID()),
        status: ReportStatus = ReportStatus.PENDING,
    ): PlayerReport =
        PlayerReport(
            id = ReportId(UUID.randomUUID()),
            wordText = wordText,
            clueText = clueText,
            reason = reason,
            note = note,
            puzzleId = UUID.randomUUID(),
            surface = surface,
            reporterId = reporterId,
            status = status,
            createdAt = Instant.parse("2026-07-11T10:00:00Z"),
        )

    @Test
    fun `rejects blank wordText`() {
        assertFailure { report(wordText = " ") }.messageContains("wordText")
    }

    @Test
    fun `accepts absent wordText`() {
        assertThat(report(wordText = null).wordText).isEqualTo(null)
    }

    @Test
    fun `rejects blank clueText`() {
        assertFailure { report(clueText = "") }.messageContains("clueText")
    }

    @Test
    fun `rejects wordText over 64 chars`() {
        assertFailure { report(wordText = "x".repeat(65)) }.messageContains("wordText")
    }

    @Test
    fun `accepts wordText of exactly 64 chars`() {
        assertThat(report(wordText = "x".repeat(64)).wordText).isEqualTo("x".repeat(64))
    }

    @Test
    fun `rejects clueText over 512 chars`() {
        assertFailure { report(clueText = "x".repeat(513)) }.messageContains("clueText")
    }

    @Test
    fun `accepts clueText of exactly 512 chars`() {
        assertThat(report(clueText = "x".repeat(512)).clueText).isEqualTo("x".repeat(512))
    }

    @Test
    fun `rejects note over 500 chars`() {
        assertFailure { report(note = "x".repeat(501)) }.messageContains("note")
    }

    @Test
    fun `accepts note of exactly 500 chars`() {
        assertThat(report(note = "x".repeat(500)).note).isEqualTo("x".repeat(500))
    }

    @Test
    fun `harm reason is flagged`() {
        assertThat(report(reason = ReportReason.MOT_OFFENSANT).reason.isHarm()).isTrue()
    }

    @Test
    fun `non-harm reason is not flagged`() {
        assertThat(report(reason = ReportReason.TROP_FACILE).reason.isHarm()).isFalse()
    }

    @Test
    fun `defaults to pending with no triage metadata`() {
        val r = report()
        assertThat(r.status).isEqualTo(ReportStatus.PENDING)
        assertThat(r.triagedAt).isEqualTo(null)
        assertThat(r.triagedBy).isEqualTo(null)
    }

    @Test
    fun `allows anonymous reporter`() {
        assertThat(report(reporterId = null).reporterId).isEqualTo(null)
    }
}
