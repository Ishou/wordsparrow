package com.bliss.grid.application.correction

import com.bliss.grid.domain.correction.ClueCorrection
import java.util.UUID

/** Backfill progress for a recorded correction; [gridsMatched] is null until the worker counts grids (ADR-0108 §4). */
data class CorrectionProgress(
    val correctionId: UUID,
    val kind: ClueCorrection.Kind,
    val backfillStatus: BackfillStatus,
    val gridsMatched: Int?,
    val gridsPatched: Int,
)
