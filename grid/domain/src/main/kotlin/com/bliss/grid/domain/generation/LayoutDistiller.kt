package com.bliss.grid.domain.generation

/**
 * Greedy black-cell minimizer for seeded layouts: repeatedly whitens the
 * black cell whose removal most improves the board — 2-cell runs merged
 * away first, then the shortest adjacent runs — keeping a removal only if
 * the board stays valid ([SlotRegistry.build] succeeds, no run exceeds
 * lUseful, no orphan white). Definition-cell density drops and short
 * filler runs survive only where geometry truly needs them.
 */
internal object LayoutDistiller {
    fun distill(
        cells: CellArray,
        minLen: Int,
        lUseful: Int,
        lexicon: Lexicon,
        maxRemovals: Int = Int.MAX_VALUE,
        deadlineMs: Long = 1_500,
    ): Int {
        val deadline = System.currentTimeMillis() + deadlineMs
        var removedTotal = 0
        while (removedTotal < maxRemovals && System.currentTimeMillis() < deadline) {
            val candidate = bestRemovableBlack(cells, minLen, lUseful, lexicon) ?: break
            cells.set(candidate.first, candidate.second, CellArray.EMPTY)
            removedTotal++
        }
        return removedTotal
    }

    private fun bestRemovableBlack(
        cells: CellArray,
        minLen: Int,
        lUseful: Int,
        lexicon: Lexicon,
    ): Pair<Int, Int>? {
        var best: Pair<Int, Int>? = null
        var bestScore = Int.MIN_VALUE
        for (r in 0 until cells.height) {
            for (c in 0 until cells.width) {
                if (!cells.isBlack(r, c)) continue
                val score = removalScore(cells, r, c)
                if (score <= bestScore) continue
                if (!removalKeepsBoardValid(cells, r, c, minLen, lUseful, lexicon)) continue
                best = r to c
                bestScore = score
            }
        }
        return best
    }

    // Higher = more desirable removal: eliminating a 2-run dominates, then merging short runs.
    private fun removalScore(
        cells: CellArray,
        r: Int,
        c: Int,
    ): Int {
        val left = runLengthLeft(cells, r, c)
        val right = runLengthRight(cells, r, c)
        val up = runLengthUp(cells, r, c)
        val down = runLengthDown(cells, r, c)
        val segments = listOf(left, right, up, down).filter { it > 0 }
        if (segments.isEmpty()) return 0
        val twoRunsErased = segments.count { it == 2 }
        return twoRunsErased * 100 - segments.min()
    }

    private fun removalKeepsBoardValid(
        cells: CellArray,
        r: Int,
        c: Int,
        minLen: Int,
        lUseful: Int,
        lexicon: Lexicon,
    ): Boolean {
        cells.set(r, c, CellArray.EMPTY)
        val h = runLengthLeft(cells, r, c) + 1 + runLengthRight(cells, r, c)
        val v = runLengthUp(cells, r, c) + 1 + runLengthDown(cells, r, c)
        // Supply-aware: a removal survives only if every slot keeps a healthy candidate pool (cheap proxy for fillability; full AC-3 per candidate is too slow).
        val valid =
            h <= lUseful && v <= lUseful &&
                (h >= minLen || v >= minLen) &&
                SlotRegistry.build(cells, lexicon, minLen)?.slots?.all {
                    lexicon.popcount(it.domain) >= MIN_SLOT_SUPPLY
                } == true
        if (!valid) cells.set(r, c, CellArray.BLACK)
        return valid
    }

    private const val MIN_SLOT_SUPPLY = 40

    private fun runLengthLeft(
        cells: CellArray,
        r: Int,
        c: Int,
    ): Int {
        var n = 0
        var i = c - 1
        while (i >= 0 && !cells.isBlack(r, i)) {
            n++
            i--
        }
        return n
    }

    private fun runLengthRight(
        cells: CellArray,
        r: Int,
        c: Int,
    ): Int {
        var n = 0
        var i = c + 1
        while (i < cells.width && !cells.isBlack(r, i)) {
            n++
            i++
        }
        return n
    }

    private fun runLengthUp(
        cells: CellArray,
        r: Int,
        c: Int,
    ): Int {
        var n = 0
        var i = r - 1
        while (i >= 0 && !cells.isBlack(i, c)) {
            n++
            i--
        }
        return n
    }

    private fun runLengthDown(
        cells: CellArray,
        r: Int,
        c: Int,
    ): Int {
        var n = 0
        var i = r + 1
        while (i < cells.height && !cells.isBlack(i, c)) {
            n++
            i++
        }
        return n
    }
}
