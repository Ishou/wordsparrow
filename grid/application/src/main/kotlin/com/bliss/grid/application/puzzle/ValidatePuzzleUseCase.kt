package com.bliss.grid.application.puzzle

import com.bliss.grid.domain.model.LetterCell
import java.util.UUID

/** Binary oracle: returns `solved` iff every letter cell is filled and matches the solution; ADR-0076. */
class ValidatePuzzleUseCase(
    private val puzzleRepository: PuzzleRepository,
) {
    fun execute(
        puzzleId: UUID,
        filled: List<FilledCellInput>,
    ): ValidatePuzzleOutcome {
        val puzzle = puzzleRepository.get(puzzleId) ?: return ValidatePuzzleOutcome.PuzzleNotFound

        val grid = puzzle.grid
        val byPosition =
            when (val resolved = resolveFilledCells(grid, filled)) {
                is ResolvedCells.Invalid -> return ValidatePuzzleOutcome.RequestInvalid(resolved.reason)
                is ResolvedCells.Ok -> resolved.byPosition
            }

        val solved =
            grid.cells.all { (pos, cell) ->
                cell !is LetterCell || byPosition[pos] == cell.letter
            }
        return ValidatePuzzleOutcome.Result(solved = solved)
    }
}

/** Plain Kotlin shape for a submitted cell; keeps the use case free of wire types. */
data class FilledCellInput(
    val row: Int,
    val column: Int,
    val letter: String,
)

sealed class ValidatePuzzleOutcome {
    /** Validation completed. [solved] is true iff every letter cell is filled and correct. */
    data class Result(
        val solved: Boolean,
    ) : ValidatePuzzleOutcome()

    /** No puzzle in the store for this id. Maps to 404 puzzle-not-found. */
    data object PuzzleNotFound : ValidatePuzzleOutcome()

    /** Out-of-range position, non-letter target, malformed letter, or duplicate cell. Maps to 400 invalid-validate-request. */
    data class RequestInvalid(
        val reason: String,
    ) : ValidatePuzzleOutcome()
}
