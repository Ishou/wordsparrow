package com.bliss.grid.domain.validation

import com.bliss.grid.domain.model.Position
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordAxis

sealed interface GridViolation {
    data class OutOfBounds(
        val position: Position,
        val gridWidth: Int,
        val gridHeight: Int,
    ) : GridViolation

    data class ClueCellLetterCellOverlap(
        val position: Position,
    ) : GridViolation

    data class InconsistentIntersection(
        val position: Position,
        val expected: Char,
        val actual: Char,
    ) : GridViolation

    data class DuplicateWord(
        val word: Word,
    ) : GridViolation

    /**
     * Two placements share the same dictionary headword (e.g. "COURT" and
     * "COURAIT" both lemma="COURIR"). The grid is structurally valid but
     * stylistically poor — mots-fléchés convention avoids placing multiple
     * inflections of the same verb / noun in the same puzzle.
     */
    data class DuplicateLemma(
        val lemma: String,
        val words: List<Word>,
    ) : GridViolation

    data class OrphanedLetterCell(
        val position: Position,
    ) : GridViolation

    /**
     * A letter cell in NO word — unfillable (no clue can reach it). Every letter
     * cell must be in at least one word; a cell in exactly one word (sandwiched by
     * black/border on the other axis) is valid half-checked mots fléchés.
     */
    data class UncrossedCell(
        val position: Position,
        val inHorizontal: Boolean,
        val inVertical: Boolean,
    ) : GridViolation

    /**
     * Three or more consecutive clue (black) cells in a row or column.
     * Real mots fléchés never pack clue cells 3 or more in a line (spec
     * §4.1 C2) — pairs are fine and common, triples are visually heavy
     * and not used in printed grids.
     */
    data class BlackTriple(
        val start: Position,
        val axis: WordAxis,
    ) : GridViolation

    /**
     * A closed clamp: two parallel length-2 slots wedged between aligned
     * black pairs (spec §4.1 C7). The trapped letter cells participate
     * in only one direction's slot while the clue text crowds them on
     * the other side; real printed mots fléchés never use these
     * micro-clamps.
     *
     * `axis` is the clamp's long axis:
     * - `VERTICAL` → 3-row × 2-col region (`BB / .. / BB`).
     * - `HORIZONTAL` → 2-row × 3-col region (`B.B / B.B`).
     */
    data class ClosedClamp(
        val topLeft: Position,
        val axis: WordAxis,
    ) : GridViolation

    /**
     * A word shorter than the dead-end minimum whose last cell is a dead
     * end — sealed ahead by a clue cell and uncrossed on the other axis
     * (clue cell or border on both sides). The tip letter has no crossing
     * to confirm it, which is unfair on a short word (ADR-0039 amendment).
     */
    data class ShortDeadEnd(
        val tip: Position,
        val axis: WordAxis,
        val length: Int,
    ) : GridViolation
}
