package com.bliss.grid.application.puzzle

import java.util.UUID

/** Server-side answer-word resolver for signalements (ADR-0111): a clue is unique within a generated grid, so `puzzleId + clueText` yields exactly one placed word. */
class ResolveWordUseCase(
    private val puzzleRepository: PuzzleRepository,
) {
    fun execute(
        puzzleId: UUID,
        clueText: String,
    ): ResolveWordOutcome {
        val puzzle = puzzleRepository.get(puzzleId) ?: return ResolveWordOutcome.ClueNotFound
        val placement =
            puzzle.grid.placements.firstOrNull { it.chosenClue.text == clueText }
                ?: return ResolveWordOutcome.ClueNotFound
        return ResolveWordOutcome.Resolved(word = placement.word.text)
    }
}

sealed class ResolveWordOutcome {
    /** The clue was found on the grid; [word] is the placed answer word (surface form). */
    data class Resolved(
        val word: String,
    ) : ResolveWordOutcome()

    /** No puzzle for the id, or no placement carries the clue text. Maps to 404 clue-not-on-puzzle. */
    data object ClueNotFound : ResolveWordOutcome()
}
