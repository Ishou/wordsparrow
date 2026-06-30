package com.bliss.grid.application.puzzle

import com.bliss.grid.domain.model.Column
import com.bliss.grid.domain.model.LetterCell
import com.bliss.grid.domain.model.Position
import com.bliss.grid.domain.model.Row
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
        val byPosition = mutableMapOf<Position, Char>()
        for (entry in filled) {
            if (entry.row < 0 || entry.row >= grid.height || entry.column < 0 || entry.column >= grid.width) {
                return ValidatePuzzleOutcome.RequestInvalid(
                    "filledCell (${entry.row}, ${entry.column}) out of grid bounds (${grid.width}x${grid.height})",
                )
            }
            if (entry.letter.length != 1 || entry.letter[0] !in 'A'..'Z') {
                return ValidatePuzzleOutcome.RequestInvalid(
                    "letter must be a single uppercase A-Z; got '${entry.letter}'",
                )
            }
            val pos = Position(Row(entry.row), Column(entry.column))
            val cell = grid.cells[pos]
            if (cell !is LetterCell) {
                return ValidatePuzzleOutcome.RequestInvalid(
                    "filledCell (${entry.row}, ${entry.column}) does not point at a letter cell",
                )
            }
            if (byPosition.put(pos, entry.letter[0]) != null) {
                return ValidatePuzzleOutcome.RequestInvalid(
                    "duplicate filledCell at (${entry.row}, ${entry.column})",
                )
            }
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
