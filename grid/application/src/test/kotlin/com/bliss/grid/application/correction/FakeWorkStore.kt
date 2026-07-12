package com.bliss.grid.application.correction

import com.bliss.grid.domain.correction.ClueCorrection
import java.util.UUID

/** In-memory [CorrectionWorkStore] fake for worker use-case tests. */
class FakeWorkStore : CorrectionWorkStore {
    class State(
        val correction: ClueCorrection,
        var status: BackfillStatus,
        var gridsMatched: Int?,
        var gridsPatched: Int,
        var error: String? = null,
        var exported: Boolean = false,
        val reason: String? = null,
    )

    val states = LinkedHashMap<UUID, State>()

    fun seed(
        correctionId: UUID,
        correction: ClueCorrection,
        status: BackfillStatus = BackfillStatus.PENDING,
        matched: Int? = null,
        patched: Int = 0,
        exported: Boolean = false,
        reason: String? = null,
    ) {
        states[correctionId] = State(correction, status, matched, patched, exported = exported, reason = reason)
    }

    override fun backfillJobs(): List<CorrectionBackfillJob> =
        states.entries
            .filter { it.value.status == BackfillStatus.PENDING || it.value.status == BackfillStatus.RUNNING }
            .map { CorrectionBackfillJob(it.key, it.value.correction, it.value.status, it.value.gridsMatched, it.value.gridsPatched) }

    override fun beginBackfill(
        correctionId: UUID,
        gridsMatched: Int,
    ) {
        states.getValue(correctionId).apply {
            status = BackfillStatus.RUNNING
            this.gridsMatched = gridsMatched
        }
    }

    override fun heartbeatBackfill(
        correctionId: UUID,
        patchedDelta: Int,
    ) {
        states.getValue(correctionId).gridsPatched += patchedDelta
    }

    override fun completeBackfill(correctionId: UUID) {
        states.getValue(correctionId).status = BackfillStatus.DONE
    }

    override fun failBackfill(
        correctionId: UUID,
        error: String,
    ) {
        states.getValue(correctionId).apply {
            status = BackfillStatus.FAILED
            this.error = error
        }
    }

    override fun exportableCorrections(): List<ExportableCorrection> =
        states.entries
            .filter { !it.value.exported && it.value.correction.isExportable() }
            .map {
                ExportableCorrection(
                    it.key,
                    it.value.correction.wordText!!,
                    it.value.correction.newClueText!!,
                    it.value.reason,
                )
            }

    override fun markExported(correctionId: UUID) {
        states.getValue(correctionId).exported = true
    }

    private fun ClueCorrection.isExportable(): Boolean = kind == ClueCorrection.Kind.REPLACE && wordText != null && newClueText != null
}
