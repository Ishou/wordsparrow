package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.correction.BackfillStatus
import com.bliss.grid.application.correction.CorrectionProgress
import com.bliss.grid.application.correction.CorrectionRepository
import com.bliss.grid.domain.correction.ClueCorrection
import com.fasterxml.uuid.Generators
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** In-memory [CorrectionRepository] for local dev / route tests without a database. */
class InMemoryCorrectionRepository : CorrectionRepository {
    private data class Row(
        val correction: ClueCorrection,
        val createdBy: UUID,
    )

    private val rows = ConcurrentHashMap<UUID, Row>()
    private val idGenerator = Generators.timeBasedEpochGenerator()

    override fun record(
        correction: ClueCorrection,
        createdBy: UUID,
    ): UUID {
        val id = idGenerator.generate()
        rows[id] = Row(correction, createdBy)
        return id
    }

    override fun active(): List<ClueCorrection> = rows.values.map { it.correction }

    override fun progress(correctionId: UUID): CorrectionProgress? =
        rows[correctionId]?.let {
            CorrectionProgress(
                correctionId = correctionId,
                kind = it.correction.kind,
                backfillStatus = BackfillStatus.PENDING,
                gridsMatched = null,
                gridsPatched = 0,
            )
        }
}
