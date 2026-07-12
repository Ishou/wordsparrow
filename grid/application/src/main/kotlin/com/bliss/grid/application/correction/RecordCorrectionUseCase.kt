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
        // Forbid check+record is serialized in the repository (ADR-0108 §2): the last-clue predicate is
        // re-evaluated against the corrections read inside the write, closing the concurrent-forbid TOCTOU.
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

    // Folds [active] (read atomically in the guard) plus this forbid onto each corpus word of the target
    // text, mirroring CorrectionAwareWordRepository.applyAll; a null result means the forbid drops its last clue.
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
