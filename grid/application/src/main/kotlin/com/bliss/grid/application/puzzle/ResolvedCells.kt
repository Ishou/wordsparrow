package com.bliss.grid.application.puzzle

import com.bliss.grid.domain.model.Column
import com.bliss.grid.domain.model.Grid
import com.bliss.grid.domain.model.LetterCell
import com.bliss.grid.domain.model.Position
import com.bliss.grid.domain.model.Row

/** Outcome of validating submitted cells against a grid's shape (shared by whole-grid and per-word validation). */
internal sealed interface ResolvedCells {
    data class Ok(
        val byPosition: Map<Position, Char>,
    ) : ResolvedCells

    data class Invalid(
        val reason: String,
    ) : ResolvedCells
}

/** Validates each submitted cell (bounds, single A-Z letter, points at a letter cell, no duplicate) and maps it to its position. */
internal fun resolveFilledCells(
    grid: Grid,
    filled: List<FilledCellInput>,
): ResolvedCells {
    val byPosition = mutableMapOf<Position, Char>()
    for (entry in filled) {
        if (entry.row < 0 || entry.row >= grid.height || entry.column < 0 || entry.column >= grid.width) {
            return ResolvedCells.Invalid(
                "filledCell (${entry.row}, ${entry.column}) out of grid bounds (${grid.width}x${grid.height})",
            )
        }
        if (entry.letter.length != 1 || entry.letter[0] !in 'A'..'Z') {
            return ResolvedCells.Invalid(
                "letter must be a single uppercase A-Z; got '${entry.letter}'",
            )
        }
        val pos = Position(Row(entry.row), Column(entry.column))
        if (grid.cells[pos] !is LetterCell) {
            return ResolvedCells.Invalid(
                "filledCell (${entry.row}, ${entry.column}) does not point at a letter cell",
            )
        }
        if (byPosition.put(pos, entry.letter[0]) != null) {
            return ResolvedCells.Invalid(
                "duplicate filledCell at (${entry.row}, ${entry.column})",
            )
        }
    }
    return ResolvedCells.Ok(byPosition)
}
