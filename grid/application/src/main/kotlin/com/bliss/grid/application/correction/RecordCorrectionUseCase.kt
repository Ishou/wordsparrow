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

    // No wordText: the clue could belong to any word, so every length bucket is scanned.
    private fun emptiesAWord(correction: ClueCorrection): Boolean {
        val lengths = correction.wordText?.let { listOf(it.uppercase().length) } ?: (1..MAX_SCAN_LENGTH)
        return lengths
            .asSequence()
            .flatMap { words.findByLength(it).asSequence() }
            .filter { it.clues.any { clue -> clue.text == correction.oldClueText } }
            .any { correction.applyTo(it) == null }
    }

    private companion object {
        // No French corpus entry approaches this length; a safe bound for a full-corpus scan.
        const val MAX_SCAN_LENGTH = 30
    }
}
