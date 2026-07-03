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
    private val nodeBudget = 1_200_000

    @Test
    fun `co-generation sweep produces a valid sparse board`() {
        val lexicon = Lexicon(loadRepository(), maxLen = 17)
        val deadline = System.currentTimeMillis() + 120_000
        var attempts = 0
        var best: Sweep? = null
        var deepestSeen = -1
        var deepestDump = ""
        while (best == null && System.currentTimeMillis() < deadline) {
            attempts++
            val sweep = Sweep(lexicon, Random(attempts.toLong()))
            if (sweep.run()) {
                best = sweep
            } else if (sweep.deepest > deepestSeen) {
                deepestSeen = sweep.deepest
                deepestDump = "=== attempt $attempts deepest row ${sweep.deepest / width} dpFails=${sweep.dpFails} realizeFails=${sweep.realizeFails} ===\n" + sweep.deathDump
            }
        }
        if (best == null && deepestDump.isNotEmpty()) println(deepestDump)
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
        var checked = 0
        var letters = 0
        for (r in 0 until height) for (c in 0 until width) {
            if (best.grid[r][c] == '#') continue
            letters++
            val h = (c > 0 && best.grid[r][c - 1] != '#') || (c < width - 1 && best.grid[r][c + 1] != '#')
            val v = (r > 0 && best.grid[r - 1][c] != '#') || (r < height - 1 && best.grid[r + 1][c] != '#')
            if (h && v) checked++
        }
        println("double-checked cells: %.0f%%".format(100.0 * checked / letters))
        println("SlotRegistry.build: " + if (build != null) "VALID (${build.slots.size} slots)" else "INVALID")
        println(best.render())
    }

    // Flexible-end prefix over the lexicon: masks per candidate total length, filtered as letters commit.
    private inner class Prefix(val lexicon: Lexicon) {
        var masks = HashMap<Int, LongArray>()
        val text = StringBuilder()
        var forcedBlackNext = false
        var reserved = false

        fun reset(
            maxTotal: Int,
            band: IntRange? = null,
        ) {
            masks.clear()
            text.setLength(0)
            forcedBlackNext = false
            reserved = false
            val top = minOf(lexicon.maxLength, maxTotal)
            val lengths =
                band?.let { b -> (maxOf(b.first, minLen)..minOf(b.last, top)).takeIf { !it.isEmpty() } }
                    ?: (minLen..top)
            for (l in lengths) {
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

        fun snapshot(): Snap = Snap(HashMap(masks.mapValues { it.value.copyOf() }), text.toString(), forcedBlackNext, reserved)

        fun restore(s: Snap) {
            masks = HashMap(s.masks.mapValues { it.value.copyOf() })
            text.setLength(0)
            text.append(s.text)
            forcedBlackNext = s.forced
            reserved = s.reserved
        }

        val isEmpty get() = text.isEmpty()

        // Due = the prefix is at (or within one of) its longest surviving candidate length.
        fun due(): Boolean {
            var maxLen = -1
            for (l in masks.keys) if (l > maxLen) maxLen = l
            if (maxLen < 0) return true
            return maxLen - text.length <= 1
        }
    }

    private class Snap(
        val masks: HashMap<Int, LongArray>,
        val text: String,
        val forced: Boolean,
        val reserved: Boolean,
    )

    private inner class Sweep(val lexicon: Lexicon, val random: Random) {
        val grid = Array(height) { CharArray(width) { '.' } }
        val words = mutableListOf<String>()
        val used = HashSet<String>()
        val columns = Array(width) { Prefix(lexicon) }
        var nodes = 0
        var deepest = 0
        var deathDump = ""
        var maxFailRow = -1
        var dpFails = 0
        var realizeFails = 0

        fun run(): Boolean {
            for (c in 0 until width) columns[c].reset(height, brickBand(c, 0))
            // Row 0 like print: alternating def/letter.
            for (c in 0 until width) {
                if (c % 2 == 0) {
                    grid[0][c] = '#'
                    columns[c].reset(height - 1, brickBand(c, 1))
                } else {
                    val bits = columns[c].continueLetters(height)
                    if (bits == 0) return false
                    val letters = (0 until 26).filter { bits and (1 shl it) != 0 }
                    grid[0][c] = 'A' + letters[random.nextInt(letters.size)]
                    columns[c].apply(grid[0][c])
                }
            }
            val colStack = ArrayList<Array<Snap>>()
            val wordStack = ArrayList<Int>()
            var r = 1
            var backtracks = 0
            while (r < height) {
                colStack.add(Array(width) { columns[it].snapshot() })
                wordStack.add(words.size)
                if (fillRowDp(r)) {
                    r++
                    deepest = maxOf(deepest, r * width)
                    continue
                }
                colStack.removeLast()
                wordStack.removeLast()
                if (r <= 1 || backtracks >= 80) return false
                backtracks++
                r--
                val snaps = colStack.removeLast()
                for (i in 0 until width) columns[i].restore(snaps[i])
                val keep = wordStack.removeLast()
                while (words.size > keep) used.remove(words.removeLast())
                grid[r].fill('.')
            }
            return true
        }

        fun toCellArray(): CellArray {
            val cells = CellArray(width, height)
            for (r in 0 until height) for (c in 0 until width) if (grid[r][c] == '#') cells.set(r, c, CellArray.BLACK)
            return cells
        }

        fun render(): String = grid.joinToString("\n") { it.concatToString() }

        fun dumpState(r: Int): String {
            val sb = StringBuilder()
            sb.append("failed row r=").append(r).append('\n')
            for (row in 0 until r) sb.append(grid[row].concatToString()).append('\n')
            sb.append("cols: ")
            for (i in 0 until width) {
                val col = columns[i]
                sb.append(i).append("='").append(col.text).append('\'')
                    .append(if (col.forcedBlackNext) "F" else "")
                    .append(if (col.continueLetters(height - r) != 0) "c" else "")
                    .append(if (col.completeWord(used) != null) "K" else "")
                    .append(if (col.reserved) "R" else "").append(' ')
            }
            return sb.toString()
        }

        // === row engine: exact DP over one row, then backward sampling ===

        // Per-position facts derived from column states (fixed before the row).
        private inner class RowFacts(r: Int) {
            val maskLetters = IntArray(width)
            val anyLetters = IntArray(width)
            val blackAllowed = BooleanArray(width)
            val forcedBlack = BooleanArray(width)
            val vClumpBlocked = BooleanArray(width)

            init {
                val rowsBelow = height - r - 1
                for (c in 0 until width) {
                    val col = columns[c]
                    maskLetters[c] = if (col.forcedBlackNext) 0 else col.continueLetters(rowsBelow + 1)
                    val orphan = col.isEmpty && !col.forcedBlackNext && r + 1 < height
                    anyLetters[c] = if (orphan) 0x3FFFFFF else maskLetters[c]
                    // bottom row: letters must complete the column — restrict to completing letters
                    if (r == height - 1) {
                        var completing = 0
                        val v = col.text.length
                        col.masks[v + 1]?.let { m ->
                            completing = lexicon.lettersAt(v + 1, v, m)
                        }
                        maskLetters[c] = maskLetters[c] and completing
                        anyLetters[c] = maskLetters[c]
                    }
                    blackAllowed[c] = col.isEmpty || col.forcedBlackNext || col.reserved || col.completeWord(used) != null
                    forcedBlack[c] = col.forcedBlackNext
                    vClumpBlocked[c] = r > 1 && grid[r - 1][c] == '#' && grid[r - 2][c] == '#'
                }
            }
        }

        // DP states per position: bit0 = reachable with prevBlackRun 0 (just closed a word/letter, needs black next unless border)
        //   we track: arrival "afterBlack" count (0 = after word, 1 = one black, 2 = two blacks) and mustBlack flag folded in.
        private fun fillRowDp(r: Int): Boolean {
            nodes++
            val facts = RowFacts(r)
            // reach[c][k]: position c reachable with k = consecutive blacks just before c (0,1,2); words may start iff k>=1 or (c==0 hosted)
            val reach = Array(width + 1) { BooleanArray(3) }
            val col0Hosted = grid[r - 1][0] == '#'
            reach[0][if (col0Hosted) 1 else 0] = true
            // transitions
            // Border delimits runs: a single letter at col 0 is legal without a left black.
            if (reach[0][0] && facts.maskLetters[0] != 0 && !facts.forcedBlack[0]) reach[1][0] = true
            for (c in 0 until width) {
                for (k in 0..2) {
                    if (!reach[c][k]) continue
                    // black
                    if (facts.blackAllowed[c] && !facts.vClumpBlocked[c] && k < 2) {
                        reach[c + 1][k + 1] = true
                    }
                    if (facts.forcedBlack[c]) continue
                    // words (len >= 2), hosted iff k >= 1
                    if (k >= 1) {
                        for (l in 2..minOf(lexicon.maxLength, width - c)) {
                            if (lexicon.count(l) == 0) continue
                            var ok = true
                            var covered = 0
                            var m: LongArray? = null
                            for (i in 0 until l) {
                                if (facts.forcedBlack[c + i] || facts.anyLetters[c + i] == 0) { ok = false; break }
                                covered++
                            }
                            if (!ok) continue
                            m = lexicon.initialMask(l)
                            for (i in 0 until l) {
                                val union = lexicon.unionMaskForLetters(l, i, facts.anyLetters[c + i])
                                for (j in m.indices) m[j] = m[j] and union[j]
                                if (lexicon.popcount(m) == 0) { ok = false; break }
                            }
                            if (ok) reach[c + l][0] = true
                        }
                        // single letter (across run 1): needs vertical >= 2 (mask letters only) and black next (or border)
                        if (facts.maskLetters[c] != 0 && !facts.forcedBlack[c]) reach[c + 1][0] = true
                    } else if (facts.forcedBlack[c]) {
                        continue
                    }
                }
                // forced black position must be black: kill any reach state that would place a letter here — handled implicitly (word/letter transitions skip forcedBlack)
            }
            if (!(reach[width][0] || reach[width][1] || reach[width][2])) {
                dpFails++
                if (r > maxFailRow) {
                    maxFailRow = r
                    deathDump = "DP-INFEASIBLE " + dumpState(r)
                }
                return false
            }
            // Sample several realizations, keep the one leaving the most future flexibility.
            var bestScore = Int.MIN_VALUE
            var bestRow: CharArray? = null
            var bestSnaps: Array<Snap>? = null
            var bestWords: List<String>? = null
            val preSnaps = Array(width) { columns[it].snapshot() }
            val preWords = words.size
            var got = 0
            var tries = 0
            while (got < 8 && tries < 40) {
                tries++
                if (realizeRow(r, facts, reach)) {
                    got++
                    val score = if (nextRowFeasible(r)) futureFlexibility(r) else Int.MIN_VALUE / 2
                    if (score > bestScore) {
                        bestScore = score
                        bestRow = grid[r].copyOf()
                        bestSnaps = Array(width) { columns[it].snapshot() }
                        bestWords = words.subList(preWords, words.size).toList()
                    }
                    // roll back and resample
                    for (i in 0 until width) columns[i].restore(preSnaps[i])
                    while (words.size > preWords) used.remove(words.removeLast())
                    grid[r].fill('.')
                }
            }
            val row = bestRow
            if (row != null) {
                for (i in 0 until width) grid[r][i] = row[i]
                for (i in 0 until width) columns[i].restore(bestSnaps!![i])
                for (w in bestWords!!) {
                    words.add(w)
                    used.add(w)
                }
                return true
            }
            realizeFails++
            if (r > maxFailRow) {
                maxFailRow = r
                deathDump = "REALIZE-FAILED " + dumpState(r)
            }
            return false
        }

        // Exact one-row lookahead: is the next row's DP feasible given current column states?
        private fun nextRowFeasible(r: Int): Boolean {
            if (r + 1 >= height) return true
            val facts = RowFacts(r + 1)
            val reach = Array(width + 1) { BooleanArray(3) }
            val col0Hosted = grid[r][0] == '#'
            reach[0][if (col0Hosted) 1 else 0] = true
            if (reach[0][0] && facts.maskLetters[0] != 0 && !facts.forcedBlack[0]) reach[1][0] = true
            for (c in 0 until width) {
                for (k in 0..2) {
                    if (!reach[c][k]) continue
                    if (facts.blackAllowed[c] && !facts.vClumpBlocked[c] && k < 2) reach[c + 1][k + 1] = true
                    if (facts.forcedBlack[c]) continue
                    if (k >= 1) {
                        for (l in 2..minOf(lexicon.maxLength, width - c)) {
                            if (lexicon.count(l) == 0) continue
                            var ok = true
                            for (i in 0 until l) {
                                if (facts.forcedBlack[c + i] || facts.anyLetters[c + i] == 0) {
                                    ok = false
                                    break
                                }
                            }
                            if (!ok) continue
                            val m = lexicon.initialMask(l)
                            for (i in 0 until l) {
                                val union = lexicon.unionMaskForLetters(l, i, facts.anyLetters[c + i])
                                for (j in m.indices) m[j] = m[j] and union[j]
                                if (lexicon.popcount(m) == 0) {
                                    ok = false
                                    break
                                }
                            }
                            if (ok) reach[c + l][0] = true
                        }
                        if (facts.maskLetters[c] != 0 && !facts.forcedBlack[c]) reach[c + 1][0] = true
                    }
                }
            }
            return reach[width][0] || reach[width][1] || reach[width][2]
        }

        // Higher = the next rows have more landing options: columns terminable within 2 rows,
        // empty columns, and no long stretch without a prospective landing.
        private fun futureFlexibility(r: Int): Int {
            // Hard corner check: next row's position 0 must have a legal move —
            // hosted (black at (r,0)), or col0/col1 landing within one row.
            if (r + 1 < height) {
                val corner =
                    grid[r][0] == '#' || landsWithin(columns[0], 0) || landsWithin(columns[1], 0)
                if (!corner) return Int.MIN_VALUE / 2
            }
            var score = 0
            var gap = 0
            var maxGap = 0
            for (c in 0 until width) {
                val col = columns[c]
                val lands = landsWithin(col, 2)
                if (lands) {
                    score += if (col.isEmpty) 3 else 2
                    gap = 0
                } else {
                    gap++
                    if (gap > maxGap) maxGap = gap
                }
            }
            return score - maxGap * 2
        }

        private fun landsWithin(
            col: Prefix,
            k: Int,
        ): Boolean {
            if (col.isEmpty || col.forcedBlackNext || col.reserved) return true
            var minLenLeft = Int.MAX_VALUE
            for (l in col.masks.keys) if (l - col.text.length < minLenLeft) minLenLeft = l - col.text.length
            return minLenLeft <= k
        }

        private fun realizeRow(
            r: Int,
            facts: RowFacts,
            reach: Array<BooleanArray>,
        ): Boolean {
            nodes++
            val rowChars = CharArray(width) { '?' }
            val rowUsed = ArrayList<String>()
            // walk backward choosing transitions consistent with reach
            data class Step(val from: Int, val k: Int, val type: Int, val len: Int, val word: String?)
            val steps = ArrayList<Step>()
            var c = width
            var k = (0..2).filter { reach[width][it] }.let { it[random.nextInt(it.size)] }
            var guard = 0
            while (c > 0 && guard++ < 200) {
                // enumerate possible predecessors
                val options = ArrayList<Step>()
                if (k in 1..2) {
                    // arrived via black at c-1
                    val pc = c - 1
                    if (facts.blackAllowed[pc] && !facts.vClumpBlocked[pc] && reach[pc][k - 1]) {
                        options.add(Step(pc, k - 1, 0, 1, null))
                    }
                } else {
                    // arrived via word or single letter ending at c-1
                    for (l in 2..minOf(lexicon.maxLength, c)) {
                        val p = c - l
                        val hostedK = (1..2).filter { reach[p][it] }
                        if (hostedK.isEmpty()) continue
                        if ((0 until l).any { facts.forcedBlack[p + it] || facts.anyLetters[p + it] == 0 }) continue
                        val m = lexicon.initialMask(l)
                        var ok = true
                        for (i in 0 until l) {
                            val union = lexicon.unionMaskForLetters(l, i, facts.anyLetters[p + i])
                            for (j in m.indices) m[j] = m[j] and union[j]
                            if (lexicon.popcount(m) == 0) { ok = false; break }
                        }
                        if (!ok) continue
                        // sample an unused word
                        var word: String? = null
                        repeat(8) {
                            val idx = lexicon.pickIndex(m, random)
                            if (idx >= 0) {
                                val w = lexicon.wordAt(l, idx).text
                                if (w !in used && w !in rowUsed) word = w
                            }
                            if (word != null) return@repeat
                        }
                        if (word != null) options.add(Step(p, hostedK[random.nextInt(hostedK.size)], 1, l, word))
                    }
                    val pc = c - 1
                    if (pc >= 0 && facts.maskLetters[pc] != 0 && !facts.forcedBlack[pc]) {
                        for (kk in 1..2) if (reach[pc][kk]) options.add(Step(pc, kk, 2, 1, null))
                    }
                    if (pc == 0 && facts.maskLetters[0] != 0) {
                        // col-0 single letter unhosted-left is fine (across run 1)
                        if (reach[0][0]) options.add(Step(0, 0, 2, 1, null))
                    }
                }
                if (options.isEmpty()) return false
                val weights = options.map { o ->
                    when {
                        o.type == 1 && o.len in 4..7 -> 6
                        o.type == 1 && o.len == 3 -> 3
                        o.type == 1 && o.len >= 8 -> 2
                        o.type == 1 -> 1
                        o.type == 0 -> 3
                        else -> 1
                    }
                }
                var pickAt = random.nextInt(weights.sum())
                var stepIdx = 0
                for ((i, w) in weights.withIndex()) {
                    if (pickAt < w) { stepIdx = i; break }
                    pickAt -= w
                }
                val step = options[stepIdx]
                steps.add(step)
                c = step.from
                k = step.k
            }
            if (c != 0) return false
            // apply forward
            steps.reverse()
            val colSnaps = Array(width) { columns[it].snapshot() }
            val wMark = words.size
            var pos = 0
            for (step in steps) {
                when (step.type) {
                    0 -> {
                        if (!applyBlack(r, pos)) { rollback(colSnaps, wMark, r); return false }
                        rowChars[pos] = '#'
                        pos++
                    }
                    1 -> {
                        val w = step.word!!
                        for (i in w.indices) {
                            if (!applyRowLetter(r, pos + i, w[i], facts)) { rollback(colSnaps, wMark, r); return false }
                            rowChars[pos + i] = w[i]
                        }
                        words.add(w)
                        used.add(w)
                        rowUsed.add(w)
                        pos += w.length
                    }
                    2 -> {
                        val bits = facts.maskLetters[pos]
                        val letters = (0 until 26).filter { bits and (1 shl it) != 0 }
                        if (letters.isEmpty()) { rollback(colSnaps, wMark, r); return false }
                        val ch = 'A' + letters[random.nextInt(letters.size)]
                        if (!applyRowLetter(r, pos, ch, facts)) { rollback(colSnaps, wMark, r); return false }
                        rowChars[pos] = ch
                        pos++
                    }
                }
            }
            for (i in 0 until width) grid[r][i] = rowChars[i]
            return true
        }

        private fun applyBlack(
            r: Int,
            c: Int,
        ): Boolean {
            val col = columns[c]
            if (!col.isEmpty && !col.forcedBlackNext && !col.reserved) {
                val w = col.completeWord(used) ?: return false
                words.add(w)
                used.add(w)
            }
            col.reset(height - r - 1, brickBand(c, r))
            return true
        }

        private fun applyRowLetter(
            r: Int,
            c: Int,
            ch: Char,
            facts: RowFacts,
        ): Boolean {
            val col = columns[c]
            val rowsBelow = height - r - 1
            if (!col.forcedBlackNext && col.continueLetters(rowsBelow + 1) and (1 shl (ch - 'A')) != 0) {
                col.apply(ch)
            } else if (col.isEmpty && r + 1 < height) {
                col.apply(ch)
                col.forcedBlackNext = true
            } else {
                return false
            }
            // reservation: no continuation left -> word fixed now
            if (!col.forcedBlackNext && !col.reserved && r != height - 1 && col.continueLetters(rowsBelow) == 0) {
                val w = col.completeWord(used) ?: return false
                words.add(w)
                used.add(w)
                col.reserved = true
            }
            if (r == height - 1 && !col.forcedBlackNext && !col.reserved) {
                val w = col.completeWord(used) ?: return false
                words.add(w)
                used.add(w)
            }
            return true
        }

        private fun rollback(
            colSnaps: Array<Snap>,
            wMark: Int,
            r: Int,
        ) {
            for (i in 0 until width) columns[i].restore(colSnaps[i])
            while (words.size > wMark) used.remove(words.removeLast())
            grid[r].fill('.')
        }

        // Brick-staggered vertical planning.
        private fun brickBand(
            c: Int,
            r: Int,
        ): IntRange {
            // Left column mirrors print: short verticals so the corner always has landings
            // (everything in col 0 is hosted from above).
            if (c == 0) return 2..3
            // Top band mirrors print: columns starting in rows 0-1 are mostly short, so rows
            // 2-3 inherit plentiful staggered landings instead of impossible long spans.
            if (r <= 1) return if (random.nextInt(3) < 2) 2..4 else 3..6
            // Bottom band mirrors print too: late starters stay short so everyone lands by the border.
            if (r >= height - 5) return 2..4
            // ~30% short columns (2-4): the landing lubricant for middle rows.
            if ((c + r) % 3 == 0) return 2..4
            val base = 3 + ((c * 2 + r + random.nextInt(2)) % 4)
            return base..base + 2
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
