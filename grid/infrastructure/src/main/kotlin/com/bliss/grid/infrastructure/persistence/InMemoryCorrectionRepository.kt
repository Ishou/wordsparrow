package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.correction.BackfillStatus
import com.bliss.grid.application.correction.CorrectionProgress
import com.bliss.grid.application.correction.CorrectionRepository
import com.bliss.grid.application.correction.GuardedRecord
import com.bliss.grid.domain.correction.ClueCorrection
import com.fasterxml.uuid.Generators
import java.util.UUID

/** In-memory [CorrectionRepository] for local dev / route tests without a database. */
class InMemoryCorrectionRepository : CorrectionRepository {
    private data class Row(
        val correction: ClueCorrection,
        val createdBy: UUID,
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

    // Check+record run inside the one lock so the predicate sees every prior forbid — the in-memory
    // analogue of the Postgres advisory lock (ADR-0108 §2).
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

    override fun active(): List<ClueCorrection> = synchronized(lock) { rows.values.map { it.correction } }

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
