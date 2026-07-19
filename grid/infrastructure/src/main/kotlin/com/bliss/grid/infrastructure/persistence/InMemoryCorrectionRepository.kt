package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.correction.BackfillStatus
import com.bliss.grid.application.correction.CorrectionProgress
import com.bliss.grid.application.correction.CorrectionRepository
import com.bliss.grid.application.correction.GuardedRecord
import com.bliss.grid.application.correction.ReversibleCorrection
import com.bliss.grid.domain.correction.ClueCorrection
import com.fasterxml.uuid.Generators
import java.util.UUID

/** In-memory [CorrectionRepository] for local dev / route tests without a database. */
class InMemoryCorrectionRepository : CorrectionRepository {
    private data class Row(
        val correction: ClueCorrection,
        val createdBy: UUID,
        val reverted: Boolean = false,
    )

    private val lock = Any()

    // LinkedHashMap under the lock preserves creation order so the overlay supersedes oldest with newest (ADR-0108).
    private val rows = LinkedHashMap<UUID, Row>()
    private val idGenerator = Generators.timeBasedEpochGenerator()

    override fun record(
        correction: ClueCorrection,
        createdBy: UUID,
    ): UUID {
        val id = idGenerator.generate()
        synchronized(lock) { rows[id] = Row(correction, createdBy) }
        return id
    }

    // Check+record run inside the one lock, the in-memory analogue of the Postgres advisory lock (ADR-0108 §2).
    override fun recordForbidGuarded(
        correction: ClueCorrection,
        createdBy: UUID,
        wouldEmptyWord: (active: List<ClueCorrection>) -> Boolean,
    ): GuardedRecord =
        synchronized(lock) {
            if (wouldEmptyWord(rows.values.map { it.correction })) {
                GuardedRecord.LastClueForbidden
            } else {
                val id = idGenerator.generate()
                rows[id] = Row(correction, createdBy)
                GuardedRecord.Recorded(id)
            }
        }

    override fun active(): List<ClueCorrection> = synchronized(lock) { rows.values.filterNot { it.reverted }.map { it.correction } }

    override fun findReversible(
        oldClueText: String,
        wordText: String?,
    ): List<ReversibleCorrection> =
        synchronized(lock) {
            val folded = wordText?.uppercase()
            rows.entries
                .filterNot { it.value.reverted }
                .filter { (_, row) ->
                    val c = row.correction
                    c.oldClueText == oldClueText ||
                        (c.kind == ClueCorrection.Kind.BLOCKLIST_WORD && folded != null && c.wordText?.uppercase() == folded)
                }.map { (id, row) ->
                    ReversibleCorrection(
                        id,
                        row.correction.kind,
                        row.correction.oldClueText,
                        row.correction.newClueText,
                        row.correction.wordText,
                    )
                }.reversed()
        }

    override fun deactivate(correctionId: UUID) {
        synchronized(lock) { rows[correctionId]?.let { rows[correctionId] = it.copy(reverted = true) } }
    }

    override fun progress(correctionId: UUID): CorrectionProgress? =
        synchronized(lock) { rows[correctionId] }?.let {
            CorrectionProgress(
                correctionId = correctionId,
                kind = it.correction.kind,
                backfillStatus = BackfillStatus.PENDING,
                gridsMatched = null,
                gridsPatched = 0,
            )
        }
}
