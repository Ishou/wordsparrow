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
    ): ClueCorrection.Kind? {
        val match = corrections.findReversible(oldClueText, wordText).firstOrNull() ?: return null
        when (match.kind) {
            ClueCorrection.Kind.REPLACE -> {
                // Compensating replace(new → old): its backfill re-matches the grids showing the new clue and patches them back.
                corrections.record(
                    ClueCorrection(
                        kind = ClueCorrection.Kind.REPLACE,
                        oldClueText = match.newClueText,
                        newClueText = match.oldClueText,
                        wordText = match.wordText,
                    ),
                    reversedBy,
                )
                corrections.deactivate(match.id)
            }
            // forbid / blocklist: lift the overlay restriction; existing grids are not restored (ADR-0116).
            ClueCorrection.Kind.FORBID_CLUE, ClueCorrection.Kind.BLOCKLIST_WORD -> corrections.deactivate(match.id)
        }
        return match.kind
    }
}
