package com.bliss.grid.application.correction

import com.bliss.grid.domain.correction.ClueCorrection
import com.bliss.grid.domain.generation.WordRepository
import java.util.UUID

/**
 * Records a maintainer clue correction (ADR-0108). A `forbid_clue` that would
 * empty a located corpus word's clue list is rejected — that is the
 * blocklist-word path (regeneration), not a cheap forbid.
 */
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

    // Without wordText the owning word cannot be located cheaply; the overlay drops an emptied word defensively.
    private fun emptiesAWord(correction: ClueCorrection): Boolean {
        val folded = correction.wordText?.uppercase() ?: return false
        return words
            .findByLength(folded.length)
            .filter { it.text == folded && it.clues.any { clue -> clue.text == correction.oldClueText } }
            .any { correction.applyTo(it) == null }
    }
}
