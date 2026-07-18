package com.bliss.grid.domain.generation

import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordClue
import kotlin.random.Random

private const val STRUCT_WORDS_PER_LEN = 25 // >= L_USEFUL_FLOOR so every padded length counts as usable

/**
 * A corpus-free lexicon with dummy words at EVERY length 2..[maxLen]. Used as the build-check reference
 * during template construction: with all lengths populated, `SlotRegistry.build` null-ness reflects pure
 * structural validity (dead-ends / isolated cells / connectivity), never "a run longer than any real word".
 * This is what lets construction build-check a board whose transient runs exceed the real corpus max (ADR-0115).
 */
internal fun structuralLexicon(maxLen: Int): Lexicon {
    val byLen =
        (2..maxLen).associateWith { len ->
            (0 until STRUCT_WORDS_PER_LEN).map { i ->
                val text =
                    buildString {
                        var x = i
                        repeat(len) {
                            append('A' + (x % 26))
                            x /= 26
                        }
                    }
                Word(text = text, clues = listOf(WordClue("x")), lemma = text)
            }
        }
    val repo =
        object : WordRepository {
            override fun findByLength(length: Int): List<Word> = byLen[length].orEmpty()

            override fun findByLengthAndPattern(
                length: Int,
                pattern: Map<Int, Char>,
            ): List<Word> = emptyList()

            override fun containsLemma(text: String): Boolean = false
        }
    return Lexicon(repo, maxLen = maxLen)
}

/**
 * Builds valid, airy, anti-clustered black-cell templates (ADR-0115). Unlike the ADR-0039 seed→fill→perturb
 * loop it never perturbs: it caps every white run at [maxRun] and thins to a target density while build-checked
 * against a structural lexicon at every step, so the result is structurally valid at any size with a
 * magazine-like profile (~18% black, few 2-letter runs). Fillability against the REAL corpus is a separate
 * step (fill it, or distil it — see backoff distillation).
 */
internal object TemplateSynthesizer {
    fun synthesize(
        width: Int,
        height: Int,
        minLen: Int,
        maxRun: Int,
        blackFraction: Double,
        random: Random,
        structLex: Lexicon,
    ): CellArray? {
        require(maxRun >= minLen) { "maxRun must be >= minLen" }
        val cells = CellArray(width, height)
        // Boundary skeleton: alternating blacks on row 0 and column 0 (the ADR-0039 convention).
        var c = 0
        while (c < width) {
            cells.set(0, c, CellArray.BLACK)
            c += 2
        }
        var r = 0
        while (r < height) {
            cells.set(r, 0, CellArray.BLACK)
            r += 2
        }
        // Break the skeleton's full-length runs down to maxRun, build-checked.
        breakRunsTo(cells, width, height, minLen, maxRun, structLex)
        // Thin toward the target density with spread (0-neighbour) placements.
        val target = (blackFraction * width * height).toInt()
        var tries = 0
        while (blackCount(cells, width, height) < target && tries < 3_000) {
            tries++
            place(cells, width, height, 1 + random.nextInt(height - 1), 1 + random.nextInt(width - 1), minLen, structLex, maxNeighbours = 0)
        }
        // Reject a board that still has an over-long run (a run the breaker couldn't split legally) so the
        // caller retries with a fresh seed -- guarantees produced templates honour the cap.
        if ((longestWhiteRun(cells, width, height)?.first ?: 0) > maxRun) return null
        return if (SlotRegistry.build(cells, structLex, minLen) != null) cells else null
    }

    private fun blackCount(
        cells: CellArray,
        w: Int,
        h: Int,
    ) = (0 until h).sumOf { r -> (0 until w).count { c -> cells.isBlack(r, c) } }

    private fun blackNeighbours(
        cells: CellArray,
        w: Int,
        h: Int,
        r: Int,
        c: Int,
    ) = (if (r > 0 && cells.isBlack(r - 1, c)) 1 else 0) + (if (r < h - 1 && cells.isBlack(r + 1, c)) 1 else 0) +
        (if (c > 0 && cells.isBlack(r, c - 1)) 1 else 0) + (if (c < w - 1 && cells.isBlack(r, c + 1)) 1 else 0)

    /** Would blacking (r,c) leave an orthogonal white neighbour with a length-1 run on BOTH axes? */
    private fun isolatesNeighbour(
        cells: CellArray,
        w: Int,
        h: Int,
        r: Int,
        c: Int,
    ): Boolean {
        for ((nr, nc) in listOf(r - 1 to c, r + 1 to c, r to c - 1, r to c + 1)) {
            if (nr in 0 until h && nc in 0 until w && !cells.isBlack(nr, nc)) {
                val hAlone = (nc == 0 || cells.isBlack(nr, nc - 1)) && (nc == w - 1 || cells.isBlack(nr, nc + 1))
                val vAlone = (nr == 0 || cells.isBlack(nr - 1, nc)) && (nr == h - 1 || cells.isBlack(nr + 1, nc))
                if (hAlone && vAlone) return true
            }
        }
        return false
    }

    private fun place(
        cells: CellArray,
        w: Int,
        h: Int,
        r: Int,
        c: Int,
        minLen: Int,
        structLex: Lexicon,
        maxNeighbours: Int,
    ): Boolean {
        if (r < 1 ||
            c < 1 ||
            cells.isBlack(r, c) ||
            blackNeighbours(cells, w, h, r, c) > maxNeighbours ||
            isolatesNeighbour(cells, w, h, r, c)
        ) {
            return false
        }
        cells.set(r, c, CellArray.BLACK)
        if (SlotRegistry.build(cells, structLex, minLen) == null) {
            cells.set(r, c, CellArray.EMPTY)
            return false
        }
        return true
    }

    private fun breakRunsTo(
        cells: CellArray,
        w: Int,
        h: Int,
        minLen: Int,
        cap: Int,
        structLex: Lexicon,
    ) {
        repeat(8 * w * h) {
            val run = longestWhiteRun(cells, w, h) ?: return@repeat
            if (run.first <= cap) return@repeat
            val inRun = run.second
            val mid = inRun.size / 2
            var placed = false
            // Prefer spread (0-1 neighbours); escalate to 2 only to guarantee this run can be split at all.
            for (maxNb in 1..2) {
                var off = 0
                while (off <= mid && !placed) {
                    for (s in intArrayOf(mid - off, mid + off)) {
                        if (s in inRun.indices) {
                            val (pr, pc) = inRun[s]
                            if (place(cells, w, h, pr, pc, minLen, structLex, maxNb)) {
                                placed = true
                                break
                            }
                        }
                    }
                    off++
                }
                if (placed) break
            }
            if (!placed) return@repeat // genuinely unbreakable; synthesize() rejects the board if the cap holds
        }
    }

    /** The longest white run (length >= 2) with its cell coordinates; null if none. */
    private fun longestWhiteRun(
        cells: CellArray,
        w: Int,
        h: Int,
    ): Pair<Int, List<Pair<Int, Int>>>? {
        var best: List<Pair<Int, Int>>? = null

        fun consider(run: List<Pair<Int, Int>>) {
            if (run.size >= 2 && (best == null || run.size > best!!.size)) best = run
        }
        for (r in 0 until h) {
            var run = mutableListOf<Pair<Int, Int>>()
            for (c in 0 until w) {
                if (cells.isBlack(r, c)) {
                    consider(run)
                    run = mutableListOf()
                } else {
                    run.add(r to c)
                }
            }
            consider(run)
        }
        for (c in 0 until w) {
            var run = mutableListOf<Pair<Int, Int>>()
            for (r in 0 until h) {
                if (cells.isBlack(r, c)) {
                    consider(run)
                    run = mutableListOf()
                } else {
                    run.add(r to c)
                }
            }
            consider(run)
        }
        return best?.let { it.size to it }
    }
}
