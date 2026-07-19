package com.bliss.grid.application.correction

import com.bliss.grid.domain.correction.ClueCorrection
import java.util.UUID

/** Reverses the correction applied for a reopened report (ADR-0116); returns the reversed kind, or null when none matched. */
class ReverseCorrectionUseCase(
    private val corrections: CorrectionRepository,
) {
    fun execute(
        oldClueText: String,
        wordText: String?,
        reversedBy: UUID,
    ): ClueCorrection.Kind? =
        corrections.reverseGuarded(oldClueText, wordText, reversedBy) { match ->
            // Compensating replace(new -> old) backfills grids back; forbid/blocklist just lift the overlay restriction (ADR-0116).
            if (match.kind == ClueCorrection.Kind.REPLACE) {
                ClueCorrection(
                    kind = ClueCorrection.Kind.REPLACE,
                    oldClueText = match.newClueText,
                    newClueText = match.oldClueText,
                    wordText = match.wordText,
                )
            } else {
                null
            }
        }
}
