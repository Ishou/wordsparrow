package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.domain.correction.ClueCorrection

/** Applies a clue correction to a stored [PuzzlePayload], touching only placements whose chosen clue matches (ADR-0108 §4). */
internal object ClueCorrectionPayloadPatch {
    fun apply(
        payload: PuzzlePayload,
        correction: ClueCorrection,
    ): PuzzlePayload {
        val foldedWord = correction.wordText?.uppercase()
        val placements =
            payload.placements.map { placement ->
                if (placement.matches(correction, foldedWord)) placement.corrected(correction) else placement
            }
        return payload.copy(placements = placements)
    }

    private fun PuzzlePayload.SerializedPlacement.matches(
        correction: ClueCorrection,
        foldedWord: String?,
    ): Boolean {
        val chosen = clues.getOrNull(chosenClueIndex) ?: return false
        if (foldedWord != null && wordText.uppercase() != foldedWord) return false
        return chosen.text == correction.oldClueText
    }

    private fun PuzzlePayload.SerializedPlacement.corrected(correction: ClueCorrection): PuzzlePayload.SerializedPlacement =
        when (correction.kind) {
            ClueCorrection.Kind.REPLACE -> {
                val replacement = correction.newClueText ?: return this
                copy(clues = clues.map { if (it.text == correction.oldClueText) it.copy(text = replacement) else it })
            }
            ClueCorrection.Kind.FORBID_CLUE -> {
                val remaining = clues.filterNot { it.text == correction.oldClueText }
                check(remaining.isNotEmpty()) { "forbid_clue would empty the clue list for $wordText" }
                // Prefer a non-themed survivor, mirroring the generator's clue preference (Word.clues).
                val pick = remaining.indexOfFirst { it.theme == null }.coerceAtLeast(0)
                copy(clues = remaining, chosenClueIndex = pick)
            }
        }
}
