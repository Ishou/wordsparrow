package com.bliss.grid.domain.generation

/** Backoff distillation (ADR-0117): whitens blacks while a removal keeps the board structurally valid and fillable. */
internal object BackoffDistiller {
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
