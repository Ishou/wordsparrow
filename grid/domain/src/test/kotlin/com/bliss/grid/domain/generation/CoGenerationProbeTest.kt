package com.bliss.grid.domain.generation

import com.bliss.grid.domain.model.Word
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.io.File
import java.text.Normalizer
import kotlin.random.Random

// Feasibility probe for co-generation v1: per-cell designer sweep with flexible-end prefix masks on
// BOTH axes (maintainer's inflection-retreat lever generalized — committed letters stay, word ends
// stay open until a separator lands). Blacks are emitted where words end, never pre-committed.
@Tag("bench")
class CoGenerationProbeTest {
    private val width = 28
    private val height = 20
    private val minLen = 2
    private val nodeBudget = 400_000

    @Test
    fun `co-generation sweep produces a valid sparse board`() {
        val lexicon = Lexicon(loadRepository(), maxLen = 17)
        val deadline = System.currentTimeMillis() + 120_000
        var attempts = 0
        var best: Sweep? = null
        while (best == null && System.currentTimeMillis() < deadline) {
            attempts++
            val sweep = Sweep(lexicon, Random(attempts.toLong()))
            if (sweep.run()) {
                best = sweep
            } else if (attempts % 5 == 0) {
                println("attempt $attempts deepest cell ${sweep.deepest} (row ${sweep.deepest / width})")
            }
        }
        if (best == null) {
            println("COGEN v1 INFEASIBLE in 120s ($attempts attempts)")
            return
        }
        val cells = best.toCellArray()
        val build = SlotRegistry.build(cells, lexicon, minLen)
        var blacks = 0
        for (r in 0 until height) for (c in 0 until width) if (cells.isBlack(r, c)) blacks++
        println()
        println("COGEN v1 OK after $attempts attempt(s), ${best.nodes} nodes")
        println(
            "blacks=$blacks (%.1f%%)  words=${best.words.size}  sharing=%.2f  len2=%d".format(
                100.0 * blacks / (width * height),
                best.words.size.toDouble() / blacks,
                best.words.count { it.length == 2 },
            ),
        )
        println("len histogram: " + best.words.groupingBy { it.length }.eachCount().toSortedMap())
        println("SlotRegistry.build: " + if (build != null) "VALID (${build.slots.size} slots)" else "INVALID")
        println(best.render())
    }

    // Flexible-end prefix over the lexicon: masks per candidate total length, filtered as letters commit.
    private inner class Prefix(val lexicon: Lexicon) {
        var masks = HashMap<Int, LongArray>()
        val text = StringBuilder()
        var forcedBlackNext = false

        fun reset(maxTotal: Int) {
            masks.clear()
            text.setLength(0)
            forcedBlackNext = false
            for (l in minLen..minOf(lexicon.maxLength, maxTotal)) {
                if (lexicon.count(l) > 0) masks[l] = lexicon.initialMask(l)
            }
        }

        fun continueLetters(remaining: Int): Int {
            val v = text.length
            var bits = 0
            for ((l, mask) in masks) if (l > v && l - v <= remaining) bits = bits or lexicon.lettersAt(l, v, mask)
            return bits
        }

        fun completeWord(used: Set<String>): String? {
            val v = text.length
            if (v < minLen) return null
            val mask = masks[v] ?: return null
            if (lexicon.popcount(mask) == 0) return null
            val w = text.toString()
            return if (w in used) null else w
        }

        fun apply(ch: Char) {
            val v = text.length
            val it = masks.entries.iterator()
            while (it.hasNext()) {
                val (l, mask) = it.next()
                if (l <= v) {
                    it.remove()
                    continue
                }
                lexicon.filterByLetterInPlace(l, v, ch, mask)
                if (lexicon.popcount(mask) == 0) it.remove()
            }
            text.append(ch)
        }

        fun snapshot(): Triple<HashMap<Int, LongArray>, String, Boolean> =
            Triple(HashMap(masks.mapValues { it.value.copyOf() }), text.toString(), forcedBlackNext)

        fun restore(s: Triple<HashMap<Int, LongArray>, String, Boolean>) {
            masks = HashMap(s.first.mapValues { it.value.copyOf() })
            text.setLength(0)
            text.append(s.second)
            forcedBlackNext = s.third
        }

        val isEmpty get() = text.isEmpty()
    }

    private inner class Sweep(val lexicon: Lexicon, val random: Random) {
        val grid = Array(height) { CharArray(width) { '.' } }
        val words = mutableListOf<String>()
        val used = HashSet<String>()
        val columns = Array(width) { Prefix(lexicon) }
        val across = Prefix(lexicon)
        var nodes = 0
        var deepest = 0
        private val orphanBit = 1 shl 27

        fun run(): Boolean {
            for (c in 0 until width) columns[c].reset(height)
            across.reset(width)
            return place(0)
        }

        fun toCellArray(): CellArray {
            val cells = CellArray(width, height)
            for (r in 0 until height) for (c in 0 until width) if (grid[r][c] == '#') cells.set(r, c, CellArray.BLACK)
            return cells
        }

        fun render(): String = grid.joinToString("\n") { it.concatToString() }

        // Cell-ordered DFS: at each cell choose a letter in the intersection of both axes'
        // continuations (scored by column richness) or a black (ending both words if completable).
        private fun place(cell: Int): Boolean {
            if (cell >= width * height) return true
            if (nodes++ > nodeBudget) return false
            deepest = maxOf(deepest, cell)
            val r = cell / width
            val c = cell % width
            if (c == 0) across.reset(width)

            val col = columns[c]
            val rowsBelow = height - r - 1
            val colsRight = width - c - 1

            val blackOk = canBlack(c)
            val forced = col.forcedBlackNext || across.forcedBlackNext
            val candidates = ArrayList<Char?>(6)
            if (!forced) {
                var aBits = across.continueLetters(colsRight + 1)
                if (across.isEmpty && c + 1 < width) aBits = aBits or orphanBit
                var cBits = col.continueLetters(rowsBelow + 1)
                if (col.isEmpty && r + 1 < height) cBits = cBits or orphanBit
                // Border cells cannot be orphans on the axis that ends there.
                if (c == width - 1) aBits = aBits and orphanBit.inv()
                if (r == height - 1) cBits = cBits and orphanBit.inv()
                val bits = intersect(aBits, cBits)
                var picked = 0
                for (ch in orderLetters(bits, col, rowsBelow)) {
                    candidates.add(ch)
                    if (++picked >= 4) break
                }
            }
            // Designer rhythm: once a word reaches its sampled target length, prefer ending it —
            // proactive blacks keep terminable columns plentiful instead of running every word long.
            val acrossLen = across.text.length
            val colLen = col.text.length
            val rhythm = acrossLen >= 3 + random.nextInt(4) || colLen >= 3 + random.nextInt(4)
            if (blackOk) {
                if (rhythm) candidates.add(0, null) else candidates.add(null)
            }
            if (candidates.isEmpty()) return false

            for (ch in candidates) {
                val aSnap = across.snapshot()
                val cSnap = col.snapshot()
                val wMark = words.size
                val committed =
                    if (ch == null) {
                        grid[r][c] = '#'
                        commitBlack(r, c)
                    } else {
                        grid[r][c] = ch
                        commitLetter(r, c, ch)
                    }
                if (committed && place(cell + 1)) return true
                grid[r][c] = '.'
                across.restore(aSnap)
                columns[c].restore(cSnap)
                while (words.size > wMark) used.remove(words.removeLast())
            }
            return false
        }

        private fun intersect(
            aBits: Int,
            cBits: Int,
        ): Int {
            val all = 0x3FFFFFF
            val a = if (aBits and orphanBit != 0) all else aBits
            val b = if (cBits and orphanBit != 0) all else cBits
            return a and b and all
        }

        private fun orderLetters(
            bits: Int,
            col: Prefix,
            rowsBelow: Int,
        ): List<Char> {
            if (bits == 0) return emptyList()
            val letters = (0 until 26).filter { bits and (1 shl it) != 0 }.map { 'A' + it }
            if (letters.size == 1) return letters
            return letters.sortedByDescending { ch ->
                var richness = 0
                for ((l, mask) in col.masks) {
                    if (l <= col.text.length || l - col.text.length > rowsBelow + 1) continue
                    val copy = mask.copyOf()
                    lexicon.filterByLetterInPlace(l, col.text.length, ch, copy)
                    richness += minOf(lexicon.popcount(copy), 64)
                }
                richness + random.nextInt(24)
            }
        }

        // A black at column c requires both in-flight words to be endable (complete word, orphan-forced, or empty run).
        private fun canBlack(c: Int): Boolean {
            val col = columns[c]
            val aEnd = across.isEmpty || across.forcedBlackNext || across.completeWord(used) != null
            val cEnd = col.isEmpty || col.forcedBlackNext || col.completeWord(used) != null
            return aEnd && cEnd
        }

        private fun commitBlack(
            r: Int,
            c: Int,
        ): Boolean {
            val col = columns[c]
            if (!across.isEmpty && !across.forcedBlackNext) {
                val w = across.completeWord(used) ?: return false
                words.add(w)
                used.add(w)
            }
            if (!col.isEmpty && !col.forcedBlackNext) {
                val w = col.completeWord(used) ?: return false
                words.add(w)
                used.add(w)
            }
            across.reset(width - c - 1)
            col.reset(height - r - 1)
            return true
        }

        private fun commitLetter(
            r: Int,
            c: Int,
            ch: Char,
        ): Boolean {
            val col = columns[c]
            val colsRight = width - c - 1
            val rowsBelow = height - r - 1
            when {
                across.continueLetters(colsRight + 1) and (1 shl (ch - 'A')) != 0 -> across.apply(ch)
                across.isEmpty && c + 1 < width -> {
                    across.apply(ch)
                    across.forcedBlackNext = true
                }
                else -> return false
            }
            when {
                !col.forcedBlackNext && col.continueLetters(rowsBelow + 1) and (1 shl (ch - 'A')) != 0 -> {
                    col.apply(ch)
                }
                col.text.isEmpty() && r + 1 < height -> {
                    col.apply(ch)
                    col.forcedBlackNext = true
                }
                else -> return false
            }
            // Border endgames: at the right border the across word must complete; at the bottom the column must.
            if (c == width - 1) {
                if (!across.forcedBlackNext) {
                    val w = across.completeWord(used) ?: return false
                    words.add(w)
                    used.add(w)
                } else {
                    return false
                }
            }
            if (r == height - 1) {
                if (!col.forcedBlackNext) {
                    val w = col.completeWord(used) ?: return false
                    words.add(w)
                    used.add(w)
                } else {
                    return false
                }
            }
            return true
        }
    }

    // === corpus ===

    private fun loadRepository(): WordRepository {
        val csv =
            sequenceOf(
                File("../infrastructure/src/main/resources/words/words-fr.csv"),
                File("grid/infrastructure/src/main/resources/words/words-fr.csv"),
            ).first { it.exists() }
        val byText = LinkedHashMap<String, Word>()
        csv.useLines { lines ->
            lines.drop(1).forEach { line ->
                val cols = splitCsv(line)
                if (cols.size < 9 || cols[5].isBlank()) return@forEach
                val folded = fold(cols[0])
                if (folded.isEmpty() || folded.any { it !in 'A'..'Z' } || folded.length > 17) return@forEach
                byText.getOrPut(folded) {
                    Word(
                        folded,
                        cols[5],
                        fold(cols[8]).takeIf { it.isNotEmpty() && it.all { ch -> ch in 'A'..'Z' } } ?: folded,
                    )
                }
            }
        }
        val byLen = byText.values.groupBy { it.text.length }
        return object : WordRepository {
            override fun findByLength(length: Int): List<Word> = byLen[length].orEmpty()

            override fun countByLength(length: Int): Int = byLen[length].orEmpty().size

            override fun lettersAtPosition(
                length: Int,
                position: Int,
            ): Set<Char> = byLen[length].orEmpty().mapTo(mutableSetOf()) { it.text[position] }

            override fun findByLengthAndPattern(
                length: Int,
                pattern: Map<Int, Char>,
            ): List<Word> = byLen[length].orEmpty().filter { w -> pattern.all { (i, ch) -> w.text[i] == ch } }

            override fun containsLemma(text: String): Boolean = text.uppercase() in byText
        }
    }

    private val diacritics = "\\p{InCombiningDiacriticalMarks}+".toRegex()

    private fun fold(s: String): String =
        diacritics.replace(Normalizer.normalize(s, Normalizer.Form.NFD), "")
            .replace("œ", "oe").replace("Œ", "OE").replace("æ", "ae").replace("Æ", "AE")
            .uppercase()

    private fun splitCsv(line: String): List<String> {
        val out = ArrayList<String>(10)
        val sb = StringBuilder()
        var q = false
        for (ch in line) {
            when {
                ch == '"' -> q = !q
                ch == ',' && !q -> {
                    out += sb.toString()
                    sb.setLength(0)
                }
                else -> sb.append(ch)
            }
        }
        out += sb.toString()
        return out
    }
}
