package com.bliss.grid.application.correction

import com.bliss.grid.domain.correction.ClueCorrection
import com.bliss.grid.domain.generation.WordRepository
import java.util.UUID

/** Records a maintainer clue correction; a `forbid_clue` that would empty its word's clue list is rejected (ADR-0108). */
class RecordCorrectionUseCase(
    private val corrections: CorrectionRepository,
    private val words: WordRepository,
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
        if (correction.kind == ClueCorrection.Kind.FORBID_CLUE && emptiesAWord(correction)) {
            return Result.LastClueForbidden
        }
        return Result.Recorded(corrections.record(correction, createdBy))
    }

    // A forbid is word-scoped (route rejects a null wordText); this guard locates that word and rejects a last-clue drop.
    private fun emptiesAWord(correction: ClueCorrection): Boolean {
        val folded = correction.wordText?.uppercase() ?: return false
        return words
            .findByLength(folded.length)
            .filter { it.text == folded && it.clues.any { clue -> clue.text == correction.oldClueText } }
            .any { correction.applyTo(it) == null }
    }
}
