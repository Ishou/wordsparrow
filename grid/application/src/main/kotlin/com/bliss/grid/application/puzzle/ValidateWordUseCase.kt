package com.bliss.grid.application.puzzle

import com.bliss.grid.domain.model.LetterCell
import com.bliss.grid.domain.model.Position
import java.util.UUID

/** Internal per-word oracle (ADR-0084): `correct` iff every submitted cell matches the solution and the cells form one contiguous span; no positional data. */
class ValidateWordUseCase(
    private val puzzleRepository: PuzzleRepository,
) {
    fun execute(
        puzzleId: UUID,
        cells: List<FilledCellInput>,
    ): ValidateWordOutcome {
        val puzzle = puzzleRepository.get(puzzleId) ?: return ValidateWordOutcome.PuzzleNotFound

        val grid = puzzle.grid
        val byPosition =
            when (val resolved = resolveFilledCells(grid, cells)) {
                is ResolvedCells.Invalid -> return ValidateWordOutcome.RequestInvalid(resolved.reason)
                is ResolvedCells.Ok -> resolved.byPosition
            }

        if (byPosition.size < 2) {
            return ValidateWordOutcome.RequestInvalid("a word is at least two cells; got ${byPosition.size}")
        }
        if (!formsContiguousSpan(byPosition.keys)) {
            return ValidateWordOutcome.RequestInvalid("cells do not form a single contiguous word span")
        }

        val correct =
            byPosition.all { (pos, letter) ->
                (grid.cells[pos] as LetterCell).letter == letter
            }
        return ValidateWordOutcome.Result(correct = correct)
    }
}

/** True iff [positions] all share one row (consecutive columns) or one column (consecutive rows), with no gap. */
private fun formsContiguousSpan(positions: Set<Position>): Boolean {
    val rows = positions.mapTo(mutableSetOf()) { it.row.value }
    val columns = positions.mapTo(mutableSetOf()) { it.column.value }
    val count = positions.size
    val alongRow = rows.size == 1 && columns.size == count && columns.max() - columns.min() + 1 == count
    val alongColumn = columns.size == 1 && rows.size == count && rows.max() - rows.min() + 1 == count
    return alongRow || alongColumn
}

sealed class ValidateWordOutcome {
    /** Validation completed. [correct] is true iff every submitted cell matches the solution. */
    data class Result(
        val correct: Boolean,
    ) : ValidateWordOutcome()

    /** No puzzle in the store for this id. Maps to 404 puzzle-not-found. */
    data object PuzzleNotFound : ValidateWordOutcome()

    /** Malformed cell, non-letter target, duplicate, fewer than two cells, or not a contiguous span. Maps to 400. */
    data class RequestInvalid(
        val reason: String,
    ) : ValidateWordOutcome()
}
