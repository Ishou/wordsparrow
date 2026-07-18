package com.bliss.grid.domain.generation

/**
 * Backoff distillation (ADR-0117): starting from a dense, fillable layout, greedily whiten interior black
 * cells — keeping a removal only if the board stays structurally valid AND still fills. Each removal merges
 * two runs into one longer word, so the result is the airiest, longest-worded layout the corpus can still
 * fill at that size. The fill check is injected so the distiller stays corpus-agnostic and testable; the
 * self-limiting behaviour (a removal that pushes a run past the corpus max fails the fill check and reverts)
 * needs no explicit run cap.
 */
internal object BackoffDistiller {
    /**
     * @param start dense fillable layout; left untouched (distillation runs on a copy).
     * @param fills does this layout fill against the real corpus (within the caller's budget)?
     * @return the airiest layout reachable by single-cell removals that each keep the board fillable.
     */
    fun distill(
        start: CellArray,
        minLen: Int,
        lexicon: Lexicon,
        fills: (CellArray) -> Boolean,
    ): CellArray {
        val cells = start.copy()
        var improved = true
        while (improved) {
            improved = false
            // Interior only: the boundary skeleton (row 0 / col 0) launches the edge clues and stays put.
            for (r in 1 until cells.height) {
                for (c in 1 until cells.width) {
                    if (!cells.isBlack(r, c)) continue
                    cells.set(r, c, CellArray.EMPTY)
                    // Cheap structural gate before the expensive fill check.
                    if (SlotRegistry.build(cells, lexicon, minLen) != null && fills(cells)) {
                        improved = true
                    } else {
                        cells.set(r, c, CellArray.BLACK)
                    }
                }
            }
        }
        return cells
    }
}
