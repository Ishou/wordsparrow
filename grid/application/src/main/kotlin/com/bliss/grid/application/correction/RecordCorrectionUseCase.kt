package com.bliss.grid.application.correction

import com.bliss.grid.domain.correction.ClueCorrection
import com.bliss.grid.domain.generation.WordRepository
import com.bliss.grid.domain.model.Word
import java.util.UUID

/** Records a maintainer clue correction; a `forbid_clue` that would empty its word's clue list is rejected (ADR-0108). */
class RecordCorrectionUseCase(
    private val corrections: CorrectionRepository,
    private val corpus: WordRepository,
) {
    sealed interface Result {
        data class Recorded(
            val correctionId: UUID,
        ) : Result

        data object LastClueForbidden : Result
    }

    fun execute(
        correction: ClueCorrection,
        createdBy: UUID,
    ): Result {
        // Check+record is serialized in the repository, closing the concurrent-forbid TOCTOU (ADR-0108 §2).
        if (correction.kind == ClueCorrection.Kind.FORBID_CLUE) {
            return when (
                val outcome =
                    corrections.recordForbidGuarded(correction, createdBy) { active ->
                        emptiesAWord(correction, active)
                    }
            ) {
                is GuardedRecord.Recorded -> Result.Recorded(outcome.id)
                GuardedRecord.LastClueForbidden -> Result.LastClueForbidden
            }
        }
        return Result.Recorded(corrections.record(correction, createdBy))
    }

    // Folds active corrections plus this forbid onto each matching corpus word; null means it drops the last clue.
    private fun emptiesAWord(
        correction: ClueCorrection,
        active: List<ClueCorrection>,
    ): Boolean {
        val folded = correction.wordText?.uppercase() ?: return false
        val ordered = active + correction
        return corpus
            .findByLength(folded.length)
            .filter { it.text == folded }
            .any { word -> ordered.foldRight(word as Word?) { c, current -> current?.let { c.applyTo(it) } } == null }
    }
}
