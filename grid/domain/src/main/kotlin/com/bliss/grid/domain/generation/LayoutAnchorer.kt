package com.bliss.grid.domain.generation

/**
 * Carves a small number of long horizontal "anchor" runs into a seeded
 * layout: in K evenly spaced rows, the longest existing run is extended by
 * whitening its flanking blacks until it reaches the anchor length, each
 * step validated (runs bounded by lUseful, no orphan whites, board still
 * buildable). Unlike a global run-cap raise, only K slots get long — the
 * CSP keeps a comfortable board everywhere else.
 */
internal object LayoutAnchorer {
    fun carve(
        cells: CellArray,
        minLen: Int,
        lUseful: Int,
        lexicon: Lexicon,
        anchorCount: Int,
        anchorLen: Int,
    ): Int {
        if (anchorCount <= 0) return 0
        val targetLen = minOf(anchorLen, lUseful, cells.width)
        var carved = 0
        val spacing = cells.height / (anchorCount + 1)
        for (i in 1..anchorCount) {
            val row = (i * spacing).coerceIn(1, cells.height - 2)
            if (extendLongestRun(cells, row, targetLen, minLen, lUseful, lexicon)) carved++
        }
        return carved
    }

    private fun extendLongestRun(
        cells: CellArray,
        r: Int,
        targetLen: Int,
        minLen: Int,
        lUseful: Int,
        lexicon: Lexicon,
    ): Boolean {
        var (start, len) = longestRun(cells, r)
        if (len == 0) return false
        var progressed = true
        while (len < targetLen && progressed) {
            progressed = false
            val rightBlack = start + len
            if (rightBlack < cells.width && tryWhiten(cells, r, rightBlack, minLen, lUseful, lexicon)) {
                len = runLengthAt(cells, r, start)
                progressed = true
                continue
            }
            val leftBlack = start - 1
            if (leftBlack > 0 && tryWhiten(cells, r, leftBlack, minLen, lUseful, lexicon)) {
                start = runStartAt(cells, r, leftBlack)
                len = runLengthAt(cells, r, start)
                progressed = true
            }
        }
        return len >= targetLen
    }

    private fun tryWhiten(
        cells: CellArray,
        r: Int,
        c: Int,
        minLen: Int,
        lUseful: Int,
        lexicon: Lexicon,
    ): Boolean {
        if (!cells.isBlack(r, c)) return false
        cells.set(r, c, CellArray.EMPTY)
        val h = runLengthAt(cells, r, runStartAt(cells, r, c))
        var vLen = 1
        var i = r - 1
        while (i >= 0 && !cells.isBlack(i, c)) {
            vLen++
            i--
        }
        i = r + 1
        while (i < cells.height && !cells.isBlack(i, c)) {
            vLen++
            i++
        }
        val valid =
            h <= lUseful && vLen <= lUseful &&
                (h >= minLen || vLen >= minLen) &&
                SlotRegistry.build(cells, lexicon, minLen) != null
        if (!valid) cells.set(r, c, CellArray.BLACK)
        return valid
    }

    private fun longestRun(
        cells: CellArray,
        r: Int,
    ): Pair<Int, Int> {
        var bestStart = 0
        var bestLen = 0
        var c = 0
        while (c < cells.width) {
            if (cells.isBlack(r, c)) {
                c++
                continue
            }
            val start = c
            while (c < cells.width && !cells.isBlack(r, c)) c++
            if (c - start > bestLen) {
                bestLen = c - start
                bestStart = start
            }
        }
        return bestStart to bestLen
    }

    private fun runStartAt(
        cells: CellArray,
        r: Int,
        c: Int,
    ): Int {
        var i = c
        while (i > 0 && !cells.isBlack(r, i - 1)) i--
        return i
    }

    private fun runLengthAt(
        cells: CellArray,
        r: Int,
        start: Int,
    ): Int {
        var n = 0
        var i = start
        while (i < cells.width && !cells.isBlack(r, i)) {
            n++
            i++
        }
        return n
    }
}
