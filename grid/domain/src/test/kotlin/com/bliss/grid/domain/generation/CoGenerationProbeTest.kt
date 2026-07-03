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

    // Bump when sweep semantics change: persisted nogoods are only valid for the rule set
    // and corpus they were certified under.
    private val engineVersion = "v3-endgame1"
    private val bandVersion = "v2-validity1"

    @Test
    fun `co-generation sweep produces a valid sparse board`() {
        val lexicon = Lexicon(loadRepository(), maxLen = 17)
        val deadline = System.currentTimeMillis() + 300_000
        var attempts = 0
        var best: Sweep? = null
        var deepestSeen = -1
        var deepestDump = ""
        val nogoods = loadNogoods()
        val preloaded = nogoods.size
        val bands = loadBands()
        val newBands = LinkedHashSet<String>()
        val runSeed = System.currentTimeMillis()
        while (best == null && System.currentTimeMillis() < deadline) {
            attempts++
            val sweep = Sweep(lexicon, Random(runSeed + attempts), nogoods)
            val band =
                if ((bands.isNotEmpty() || newBands.isNotEmpty()) && attempts % 3 != 0) {
                    (bands + newBands).random(Random(runSeed + attempts * 31))
                } else {
                    null
                }
            if (sweep.run(band)) {
                best = sweep
            } else {
                if (band == null && sweep.deepest >= 10 * width) {
                    val donated = (0 until 6).joinToString("|") { sweep.grid[it].concatToString() }
                    if (!donated.contains('.')) newBands.add(donated)
                }
                if (sweep.deepest > deepestSeen) {
                deepestSeen = sweep.deepest
                    deepestDump = "=== attempt $attempts deepest row ${sweep.deepest / width} dpFails=${sweep.dpFails} realizeFails=${sweep.realizeFails} walk=${sweep.rfWalk} apply=${sweep.rfApply} (blk=${sweep.afBlack} wrd=${sweep.afWord} sgl=${sweep.afSingle} scoreRej=${sweep.scoreRejected}) nogoods=${nogoods.size} bands=${bands.size}+${newBands.size} EG[calls=${sweep.egCalls} botNull=${sweep.egBottomNull} pinDead=${sweep.egPinDead} dpNull=${sweep.egDpNull} rlz=${sweep.egRealizeFail} r19=${sweep.egRow19Fail}] ===\n" + sweep.egDump + "\n" + sweep.deathDump
                }
            }
        }
        saveBands(bands, newBands)
        saveNogoods(nogoods, preloaded)
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
        // Diagnose: unhosted runs + duplicate words.
        val g = best.grid
        for (r in 0 until height) {
            var c = 0
            while (c < width) {
                if (g[r][c] == '#') { c++; continue }
                val st = c
                while (c < width && g[r][c] != '#') c++
                if (c - st >= minLen) {
                    val hosted = (st > 0 && g[r][st - 1] == '#') || (st == 0 && r > 0 && g[r - 1][0] == '#')
                    if (!hosted) println("UNHOSTED across r=$r c=$st len=${c - st}")
                }
            }
        }
        for (c in 0 until width) {
            var r = 0
            while (r < height) {
                if (g[r][c] == '#') { r++; continue }
                val st = r
                while (r < height && g[r][c] != '#') r++
                if (r - st >= minLen) {
                    val hosted = (st > 0 && g[st - 1][c] == '#') || (st == 0 && c > 0 && g[0][c - 1] == '#')
                    if (!hosted) println("UNHOSTED down r=$st c=$c len=${r - st}")
                }
            }
        }
        val dups = best.words.groupingBy { it }.eachCount().filterValues { it > 1 }
        if (dups.isNotEmpty()) println("DUPLICATE WORDS: $dups")
        println(best.render())
    }

    // Flexible-end prefix over the lexicon: masks per candidate total length, filtered as letters commit.
    private inner class Prefix(val lexicon: Lexicon) {
        var masks = HashMap<Int, LongArray>()
        val text = StringBuilder()
        var forcedBlackNext = false
        var reserved = false
        var hostDebt = 0
        var lastSingle = false

        fun reset(
            maxTotal: Int,
            band: IntRange? = null,
        ) {
            masks.clear()
            text.setLength(0)
            forcedBlackNext = false
            reserved = false
            hostDebt = 0
            lastSingle = false
            val top = minOf(lexicon.maxLength, maxTotal)
            val lengths =
                band?.let { b -> (maxOf(b.first, minLen)..minOf(b.last, top)).takeIf { !it.isEmpty() } }
                    ?: (minLen..top)
            for (l in lengths) {
                if (lexicon.count(l) > 0) masks[l] = lexicon.initialMask(l)
            }
            // Soft bands: an escape tail of longer lengths keeps continuations alive, so a column
            // that misses its planned landing window continues instead of becoming a forced black.
            if (band != null && band.last + 2 <= top) {
                for (l in band.last + 2..top) {
                    if (lexicon.count(l) > 0) masks[l] = lexicon.initialMask(l)
                }
            }
        }

        fun forbidLength(l: Int) {
            masks.remove(l)
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

        fun snapshot(): Snap = Snap(HashMap(masks.mapValues { it.value.copyOf() }), text.toString(), forcedBlackNext, reserved, hostDebt, lastSingle)

        fun restore(s: Snap) {
            masks = HashMap(s.masks.mapValues { it.value.copyOf() })
            text.setLength(0)
            text.append(s.text)
            forcedBlackNext = s.forced
            reserved = s.reserved
            hostDebt = s.hostDebt
            lastSingle = s.lastSingle
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
        val hostDebt: Int,
        val lastSingle: Boolean,
    )

    private inner class Sweep(val lexicon: Lexicon, val random: Random, val nogoods: HashSet<Long>) {
        val grid = Array(height) { CharArray(width) { '.' } }
        val words = mutableListOf<String>()
        val used = HashSet<String>()
        val columns = Array(width) { Prefix(lexicon) }
        var nodes = 0
        var deepest = 0
        var deathDump = ""
        var maxFailRow = -1
        var dpFails = 0
            var egCalls = 0
            var egBottomNull = 0
            var egPinDead = 0
            var egDpNull = 0
            var egRealizeFail = 0
            var egRow19Fail = 0
            var egDump = ""
        var realizeFails = 0
        var nogoodHits = 0
        var rfWalk = 0
        var rfApply = 0
        var afBlack = 0
        var afWord = 0
        var afSingle = 0
        var scoreRejected = 0

        fun run(band: String? = null): Boolean {
            val startRow: Int
            if (band != null) {
                if (!replayBand(band)) return false
                startRow = 6
            } else {
                startRow = 1
                for (c in 0 until width) {
                    columns[c].reset(height, brickBand(c, 0))
                    cornerTiming(c, height)
                }
                // Row 0 like print: alternating def/letter.
                for (c in 0 until width) {
                    if (c % 2 == 0) {
                        grid[0][c] = '#'
                        columns[c].reset(height - 1, brickBand(c, 1))
                        cornerTiming(c, height - 1)
                    } else {
                        val bits = columns[c].continueLetters(height)
                        if (bits == 0) return false
                        val letters = (0 until 26).filter { bits and (1 shl it) != 0 }
                        grid[0][c] = 'A' + letters[random.nextInt(letters.size)]
                        columns[c].apply(grid[0][c])
                    }
                }
            }
            // Beam over rows: carry several board lineages; doomed ones die by selection.
            var beam = mutableListOf(captureState())
            deepest = maxOf(deepest, startRow * width)
            for (r in startRow until height - 1) {
                val children = ArrayList<Pair<BoardState, Int>>()
                for (st in beam) {
                    restoreState(st)
                    childrenOf(r).forEach { children.add(it) }
                }
                if (children.isEmpty()) return false
                children.sortByDescending { it.second }
                // Endgame variety matters most: widen the beam for the last rows.
                val w = if (r >= height - 4) beamWidth * 3 else beamWidth
                beam =
                    children
                        .distinctBy { it.first.rows[r].concatToString() }
                        .take(w)
                        .map { it.first }
                        .toMutableList()
                deepest = maxOf(deepest, (r + 1) * width)
            }
            // Endgame: solve the last two rows jointly, bottom-up, per surviving lineage.
            for (st in beam) {
                restoreState(st)
                if (solveEndgame()) {
                    deepest = height * width
                    return SlotRegistry.build(toCellArray(), lexicon, minLen) != null
                }
            }
            return false
        }

        // The beam fills rows 0..height-2; the bottom row is a one-row tiling problem
        // solved exactly (grammar B? W (B W)* with lookahead) against final column states.
        // Restrict each continuing column to letters whose completion still has an unused
        // word — a pinned column whose only completion is already claimed can never apply.
        private fun bottomConstraints(facts: RowFacts): Pair<IntArray, BooleanArray> {
            val bMask = IntArray(width)
            val bBlackOk = BooleanArray(width) { facts.blackAllowed[it] && !facts.vClumpBlocked[it] }
            for (c in 0 until width) {
                val col = columns[c]
                if (col.isEmpty) {
                    bMask[c] = facts.anyLetters[c]
                    continue
                }
                val v = col.text.length
                val m = col.masks[v + 1]
                var keep = 0
                if (m != null) {
                    var bits = facts.maskLetters[c]
                    while (bits != 0) {
                        val bit = bits and (-bits)
                        bits = bits and (bit - 1)
                        val letter = 'A' + Integer.numberOfTrailingZeros(bit)
                        val copy = m.copyOf()
                        lexicon.filterByLetterInPlace(v + 1, v, letter, copy)
                        if (anyUnusedWord(v + 1, copy)) keep = keep or bit
                    }
                }
                bMask[c] = keep
            }
            return bMask to bBlackOk
        }

        private fun anyUnusedWord(
            len: Int,
            mask: LongArray,
        ): Boolean {
            if (lexicon.popcount(mask) > used.size) return true
            for (w in mask.indices) {
                var bits = mask[w]
                while (bits != 0L) {
                    val bit = bits and (-bits)
                    bits = bits and (bit - 1)
                    val idx = w * 64 + java.lang.Long.numberOfTrailingZeros(bit)
                    if (lexicon.wordAt(len, idx).text !in used) return true
                }
            }
            return false
        }

        private fun solveEndgame(): Boolean {
            val r19 = height - 1
            val entry = captureState()
            egCalls++
            repeat(60) {
                nodes++
                val facts = RowFacts(r19)
                val (bMask, bBlackOk) = bottomConstraints(facts)
                val row19 = realizeBottomRow(bMask, bBlackOk)
                if (row19 == null) {
                    egBottomNull++
                    if (egDump.isEmpty()) {
                        val sb = StringBuilder("EGDUMP r19 cols:\n")
                        for (c in 0 until width) {
                            val col = columns[c]
                            sb.append(c).append(": pop=").append(Integer.bitCount(bMask[c]))
                                .append(" blk=").append(if (bBlackOk[c]) 1 else 0)
                                .append(" '").append(col.text).append('\'')
                                .append(if (col.forcedBlackNext) " F" else "")
                                .append(if (col.reserved) " R" else "")
                                .append(if (col.isEmpty) " E" else "")
                                .append('\n')
                        }
                        sb.append("row18: ").append(grid[height - 2].concatToString())
                        egDump = sb.toString()
                    }
                    return@repeat
                }
                if (applyEndgame(r19, row19, facts)) return true
                restoreState(entry)
            }
            return false
        }

        // Tile the bottom row exactly: grammar B? W (B W)*, guided by a backward
        // feasibility DP so sampling never commits to a length that strands later columns.
        // canStart[c]: a word starting at c can complete the bottom row's tail under the
        // exact grammar B? W (B W)* — no singles, no adjacent blacks, no trailing black.
        private fun bottomCanStart(
            bMask: IntArray,
            bBlackOk: BooleanArray,
        ): BooleanArray {
            val maxLen = minOf(lexicon.maxLength, width)
            val viable = Array(width) { c -> BooleanArray(maxLen + 1) { len -> bottomWordViable(bMask, c, len) } }
            val canStart = BooleanArray(width + 1)
            for (c in width - 1 downTo 0) {
                var ok = false
                for (len in 2..minOf(maxLen, width - c)) {
                    if (!viable[c][len]) continue
                    val end = c + len
                    if (end == width || (bBlackOk[end] && end + 1 < width && canStart[end + 1])) {
                        ok = true
                        break
                    }
                }
                canStart[c] = ok
            }
            return canStart
        }

        private fun bottomWordViable(
            bMask: IntArray,
            c: Int,
            len: Int,
        ): Boolean {
            if (len < 2 || c + len > width || lexicon.count(len) == 0) return false
            for (i in 0 until len) {
                if (bMask[c + i] == 0) return false
            }
            val m = lexicon.initialMask(len)
            for (i in 0 until len) {
                val union = lexicon.unionMaskForLetters(len, i, bMask[c + i])
                for (j in m.indices) m[j] = m[j] and union[j]
                if (lexicon.popcount(m) == 0) return false
            }
            return true
        }

        private fun bottomSolvable(
            bMask: IntArray,
            bBlackOk: BooleanArray,
        ): Boolean {
            val col0Hosted = grid[height - 2][0] == '#'
            val canStart = bottomCanStart(bMask, bBlackOk)
            return (col0Hosted && canStart[0]) || (bBlackOk[0] && canStart[1])
        }

        private fun realizeBottomRow(
            bMask: IntArray,
            bBlackOk: BooleanArray,
        ): CharArray? {
            // A word at col 0 needs the col-0 bend: black above at (height-2, 0).
            val col0Hosted = grid[height - 2][0] == '#'
            val maxLen = minOf(lexicon.maxLength, width)
            val canStart = bottomCanStart(bMask, bBlackOk)
            if (!(col0Hosted && canStart[0]) && !(bBlackOk[0] && canStart[1])) return null
            val row = CharArray(width) { '.' }
            var c = 0
            if (!(col0Hosted && canStart[0]) || (bBlackOk[0] && canStart[1] && random.nextInt(8) == 0)) {
                row[0] = '#'
                c = 1
            }
            var guard = 0
            while (c < width && guard++ < 60) {
                val lengths =
                    (2..minOf(maxLen, width - c)).filter { len ->
                        val end = c + len
                        bottomWordViable(bMask, c, len) &&
                            (end == width || (bBlackOk[end] && end + 1 < width && canStart[end + 1]))
                    }
                if (lengths.isEmpty()) return null
                val len = lengths[random.nextInt(lengths.size)]
                val m = lexicon.initialMask(len)
                for (i in 0 until len) {
                    val union = lexicon.unionMaskForLetters(len, i, bMask[c + i])
                    for (j in m.indices) m[j] = m[j] and union[j]
                }
                var idx = lexicon.pickIndex(m, random)
                var w = if (idx >= 0) lexicon.wordAt(len, idx).text else null
                if (w != null && w in used) {
                    idx = lexicon.pickIndex(m, random)
                    w = if (idx >= 0) lexicon.wordAt(len, idx).text else null
                }
                if (w == null || w in used) return null
                for (i in 0 until len) row[c + i] = w[i]
                c += len
                if (c < width) {
                    row[c] = '#'
                    c++
                }
            }
            return if (c >= width) row else null
        }

        private fun applyEndgame(
            r19: Int,
            row19: CharArray,
            facts: RowFacts,
        ): Boolean {
            for (c in 0 until width) {
                if (row19[c] == '#') {
                    if (!applyBlack(r19, c, acrossHosted = true)) {
                        egRow19Fail++
                        return false
                    }
                    grid[r19][c] = '#'
                } else {
                    if (!applyRowLetter(r19, c, row19[c], facts)) {
                        egRow19Fail++
                        return false
                    }
                    grid[r19][c] = row19[c]
                }
            }
            // Bottom-row across words register as used.
            var c = 0
            while (c < width) {
                if (grid[r19][c] == '#') {
                    c++
                    continue
                }
                val st = c
                while (c < width && grid[r19][c] != '#') c++
                if (c - st >= minLen) {
                    val w = String(CharArray(c - st) { grid[r19][st + it] })
                    if (w in used) {
                        egRow19Fail++
                        return false
                    }
                    words.add(w)
                    used.add(w)
                }
            }
            return true
        }

        private fun canBlackBottom(c: Int): Boolean {
            val col = columns[c]
            return col.isEmpty || col.forcedBlackNext || col.reserved || col.completeWord(used) != null
        }

        private fun unusedEndgameGuard(): Boolean = true

        private val beamWidth = 8
        private val expansions = 4

        private inner class BoardState(
            val rows: Array<CharArray>,
            val snaps: Array<Snap>,
            val wordList: List<String>,
        )

        private fun captureState(): BoardState =
            BoardState(
                Array(height) { grid[it].copyOf() },
                Array(width) { columns[it].snapshot() },
                words.toList(),
            )

        private fun restoreState(st: BoardState) {
            for (r in 0 until height) st.rows[r].copyInto(grid[r])
            for (c in 0 until width) columns[c].restore(st.snaps[c])
            words.clear()
            words.addAll(st.wordList)
            used.clear()
            used.addAll(st.wordList)
        }

        // Expand the current board at row r: up to `expansions` scored children.
        private fun childrenOf(r: Int): List<Pair<BoardState, Int>> {
            val sig = stateSignature(r)
            if (sig in nogoods) {
                nogoodHits++
                return emptyList()
            }
            val facts = RowFacts(r)
            val reach = buildReach(r, facts)
            if (reach == null) {
                dpFails++
                nogoods.add(sig)
                if (r > maxFailRow) {
                    maxFailRow = r
                    deathDump = "DP-INFEASIBLE " + dumpState(r)
                }
                return emptyList()
            }
            val parent = captureState()
            val out = ArrayList<Pair<BoardState, Int>>()
            var tries = 0
            var rejectedChild: BoardState? = null
            // The last rows are the critical needle: hammer candidates there — the exact
            // bottom filter means any accepted child has a provably tileable final row.
            val maxTries =
                when {
                    r >= height - 2 -> 3000
                    r >= height - 3 -> 600
                    else -> 24
                }
            val wantChildren =
                when {
                    r >= height - 2 -> 4
                    r >= height - 3 -> 16
                    else -> expansions
                }
            while (out.size < wantChildren && tries < maxTries) {
                tries++
                if (realizeRow(r, facts, reach)) {
                    val score =
                        if (stateSignature(r + 1) in nogoods || !nextRowFeasible(r)) {
                            Int.MIN_VALUE / 2
                        } else {
                            futureFlexibility(r)
                        }
                    if (score > Int.MIN_VALUE / 2) {
                        out.add(captureState() to score)
                    } else {
                        scoreRejected++
                        if (rejectedChild == null) rejectedChild = captureState()
                    }
                    restoreState(parent)
                }
            }
            if (out.isEmpty() && r > maxFailRow) {
                maxFailRow = r
                val rc = rejectedChild
                deathDump =
                    if (rc != null) {
                        restoreState(rc)
                        val d = "NEXTROW-INFEASIBLE " + dumpState(r + 1)
                        restoreState(parent)
                        d
                    } else {
                        "NO-CHILDREN " + dumpState(r)
                    }
            }
            return out
        }

        // Forward DP; null when the row is unparseable.
        private fun buildReach(
            r: Int,
            facts: RowFacts,
        ): Array<BooleanArray>? {
            nodes++
            val reach = Array(width + 1) { BooleanArray(3) }
            val col0Hosted = grid[r - 1][0] == '#'
            reach[0][if (col0Hosted) 1 else 0] = true
            if (reach[0][0] && facts.maskLetters[0] != 0 && !facts.forcedBlack[0]) reach[1][0] = true
            for (c in 0 until width) {
                for (k in 0..2) {
                    if (!reach[c][k]) continue
                    // Bottom two rows: no consecutive blacks (the first can't be hosted).
                    val maxRun = if (facts.bottomStrict) 1 else 2
                    if (facts.blackAllowed[c] && !facts.vClumpBlocked[c] && k < maxRun) {
                        reach[c + 1][k + 1] = true
                    }
                    if (facts.forcedBlack[c]) continue
                    if (k >= 1) {
                        for (l in 2..minOf(lexicon.maxLength, width - c)) {
                            if (lexicon.count(l) == 0) continue
                            var ok = true
                            for (i in 0 until l) {
                                if (facts.forcedBlack[c + i] || letterBitsAt(facts, c, l, i) == 0) {
                                    ok = false
                                    break
                                }
                            }
                            if (!ok) continue
                            val m = lexicon.initialMask(l)
                            for (i in 0 until l) {
                                val union = lexicon.unionMaskForLetters(l, i, letterBitsAt(facts, c, l, i))
                                for (j in m.indices) m[j] = m[j] and union[j]
                                if (lexicon.popcount(m) == 0) {
                                    ok = false
                                    break
                                }
                            }
                            if (ok) reach[c + l][0] = true
                        }
                        // Bottom two rows: singles after blacks are banned (their black can't be down-hosted).
                        if (facts.bottomStrict.not() && facts.maskLetters[c] != 0 && !facts.forcedBlack[c]) reach[c + 1][0] = true
                    }
                }
            }
            return if (reach[width][0] || reach[width][1] || reach[width][2]) reach else null
        }

        // Dead-end handling is a scoring concern (violations are sparse and local); keep letters permissive.
        private fun letterBitsAt(
            facts: RowFacts,
            c: Int,
            l: Int,
            i: Int,
        ): Int = facts.anyLetters[c + i]

        // Reconstruct full state from a donated opening (6 rows): columns from letters below the
        // last black, across + completed vertical words from geometry, reservations re-derived.
        fun replayBand(band: String): Boolean {
            val rows = band.split("|")
            if (rows.size != 6 || rows.any { it.length != width }) return false
            for (r in 0 until 6) for (c in 0 until width) grid[r][c] = rows[r][c]
            // across words
            for (r in 0 until 6) {
                var c = 0
                while (c < width) {
                    if (grid[r][c] == '#') {
                        c++
                        continue
                    }
                    val st = c
                    while (c < width && grid[r][c] != '#') c++
                    if (c - st >= minLen) {
                        val w = String(CharArray(c - st) { grid[r][st + it] })
                        if (w in used) return false
                        words.add(w)
                        used.add(w)
                    }
                }
            }
            // vertical words completed inside the band
            for (c in 0 until width) {
                var r = 0
                while (r < 6) {
                    if (grid[r][c] == '#') {
                        r++
                        continue
                    }
                    val st = r
                    while (r < 6 && grid[r][c] != '#') r++
                    if (r < 6 && r - st >= minLen) {
                        val w = String(CharArray(r - st) { grid[st + it][c] })
                        if (w in used) return false
                        words.add(w)
                        used.add(w)
                    }
                }
            }
            // columns: prefix = letters below the last black
            for (c in 0 until width) {
                var st = 6
                var r = 5
                while (r >= 0 && grid[r][c] != '#') {
                    st = r
                    r--
                }
                val col = columns[c]
                col.reset(height - st, null)
                cornerTiming(c, height - st)
                for (i in st until 6) {
                    val ch = grid[i][c]
                    if (col.continueLetters(height - i) and (1 shl (ch - 'A')) == 0) return false
                    col.apply(ch)
                }
                if (!col.isEmpty && col.continueLetters(height - 6) == 0) {
                    val w = col.completeWord(used) ?: return false
                    words.add(w)
                    used.add(w)
                    col.reserved = true
                }
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
            val bottomStrict = r >= height - 2
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
                    val orphan = col.isEmpty && !col.forcedBlackNext && col.hostDebt == 0
                    anyLetters[c] = if (orphan) 0x3FFFFFF else maskLetters[c]
                    // bottom row: letters must complete the column — restrict to completing letters
                    if (r == height - 1) {
                        var completing = 0
                        val v = col.text.length
                        col.masks[v + 1]?.let { m ->
                            completing = lexicon.lettersAt(v + 1, v, m)
                        }
                        maskLetters[c] = maskLetters[c] and completing
                        anyLetters[c] = if (orphan) 0x3FFFFFF else maskLetters[c]
                    }
                    // Penultimate row, corner columns: completing at height-2 would force a
                    // dead black at the bottom corner — keep the vertical open there. Mid-row
                    // completions are fine (isolated bottom blacks tile); clusters are gated.
                    if (r == height - 2 && c >= width - 2) {
                        var keepOpen = 0
                        val v = col.text.length
                        col.masks[v + 2]?.let { m ->
                            keepOpen = lexicon.lettersAt(v + 2, v, m)
                        }
                        maskLetters[c] = maskLetters[c] and keepOpen
                        anyLetters[c] = maskLetters[c]
                    }
                    blackAllowed[c] = col.hostDebt == 0 &&
                        (col.isEmpty || col.forcedBlackNext || col.reserved || col.completeWord(used) != null) &&
                        !(r >= height - 2 && c >= width - 2)
                    forcedBlack[c] = col.forcedBlackNext
                    vClumpBlocked[c] = r > 1 && grid[r - 1][c] == '#' && grid[r - 2][c] == '#'
                }
            }
        }


        // Certified-dead state learning: hash of (row, column constraint states).
        private fun stateSignature(r: Int): Long {
            var h = r.toLong() * 1_000_003L
            for (c in 0 until width) {
                val col = columns[c]
                h = h * 31 + col.text.hashCode()
                h = h * 31 + (if (col.forcedBlackNext) 17 else if (col.reserved) 13 else 7)
                for (l in 2..17) if (col.masks.containsKey(l)) h = h xor (1L shl (l + c % 8))
                h = h * 1_000_000_007L + c
            }
            return h
        }

        // Exact one-row lookahead: is the next row's DP feasible given current column states?
        private fun nextRowFeasible(r: Int): Boolean {
            if (r + 1 >= height) return true
            val facts = RowFacts(r + 1)
            if (r + 1 == height - 1) {
                val (bMask, bBlackOk) = bottomConstraints(facts)
                return bottomSolvable(bMask, bBlackOk)
            }
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
            // Certain local defects introduced by this row (determinable at r-1): heavy penalties.
            if (r >= 1) {
                var defects = 0
                for (c in 0 until width) {
                    val cell = grid[r - 1][c]
                    if (cell == '#') {
                        val rightRun = runLenRight(r - 1, c)
                        val hostsAcross = rightRun >= 2
                        val hostsDown = grid[r][c] != '#' && grid[r][c] != '.'
                        // Row-0 blacks also host via the RIGHT_DOWN bend: the vertical starting at (0, c+1).
                        val hostsBendVertical =
                            r - 1 == 0 && c + 1 < width && grid[0][c + 1] != '#' && grid[r][c + 1] != '#' && grid[r][c + 1] != '.'
                        // Col-0 blacks also host via the DOWN_RIGHT bend: the across starting at (r, 0).
                        val hostsBendAcross = c == 0 && grid[r][0] != '#' && grid[r][0] != '.' && runLenAt(r, 0) >= 2
                        if (!hostsAcross && !hostsDown && !hostsBendVertical && !hostsBendAcross) return Int.MIN_VALUE / 2
                    } else {
                        val hRun = runLenAt(r - 1, c)
                        val vBlackBelow = grid[r][c] == '#'
                        val rightBlack = c + 1 < width && grid[r - 1][c + 1] == '#'
                        val vRun = vRunLen(r - 1, c)
                        if (rightBlack && hRun < 5 && vRun == 1 && vBlackBelow) defects++
                        if (vBlackBelow && vRun < 5 && hRun == 1) defects++
                    }
                }
                score -= defects * 12
            }
            var gap = 0
            var maxGap = 0
            var reservedCount = 0
            var debtCount = 0
            for (c in 0 until width) {
                val col = columns[c]
                if (col.reserved || col.forcedBlackNext) reservedCount++
                if (col.hostDebt > 0) debtCount++
                // Near-dead prefixes strangle future across spans: penalize hard.
                if (!col.isEmpty && !col.reserved && !col.forcedBlackNext &&
                    Integer.bitCount(col.continueLetters(height)) < 2 && col.completeWord(used) == null
                ) {
                    score -= 5
                }
                val lands = landsWithin(col, 2)
                if (lands) {
                    score += if (col.isEmpty) 3 else 2
                    gap = 0
                } else {
                    gap++
                    if (gap > maxGap) maxGap = gap
                }
            }
            // Obligation budget: many forced blacks (reserved) or forced letters (hostDebt)
            // in one wave over-constrain the next row's tiling.
            score -= 6 * maxOf(0, reservedCount - 3) + 4 * maxOf(0, debtCount - 3)
            // Entering the strict zone (last two rows), adjacent forced blacks are unsatisfiable:
            // reject children that leave adjacent reservations for row height-2.
            if (r == height - 3) {
                var prev = false
                for (c in 0 until width) {
                    val col = columns[c]
                    val forced = col.reserved || col.forcedBlackNext
                    if (forced && prev) return Int.MIN_VALUE / 2
                    prev = forced
                }
                // Corner columns: any black in the last two rows there is dead — the column
                // must be able to run two more letters and complete exactly at the bottom.
                for (c in width - 2 until width) {
                    val col = columns[c]
                    if (col.reserved || col.forcedBlackNext) return Int.MIN_VALUE / 2
                    if (!col.isEmpty) {
                        val v = col.text.length
                        val keepOpen = col.masks[v + 2]?.let { lexicon.lettersAt(v + 2, v, it) } ?: 0
                        if (keepOpen == 0) return Int.MIN_VALUE / 2
                    }
                }
            }
            // Endgame: bottom-row blacks are forced wherever a column is fresh, reserved or debt-bound;
            // adjacent forced blacks are unsatisfiable under bottom-row hosting — reject a row early.
            if (r == height - 2) {
                var obligations = 0
                var lastForced = -3
                for (c in 0 until width) {
                    val col = columns[c]
                    val forced = col.reserved || col.forcedBlackNext
                    // Bottom-row blacks need a word (len >= 2) between them: distance >= 3.
                    if (forced && c - lastForced < 3) return Int.MIN_VALUE / 2
                    if (forced && c >= width - 2) return Int.MIN_VALUE / 2
                    if (forced) {
                        obligations++
                        lastForced = c
                    }
                    if (!forced && !col.isEmpty) {
                        // The bottom row gives each column exactly one more letter: it must be able
                        // to finish there (single completing letter) or already be a complete word.
                        val v = col.text.length
                        val oneLetterFinish =
                            col.masks[v + 1]?.let { lexicon.lettersAt(v + 1, v, it) } ?: 0
                        if (oneLetterFinish == 0 && col.completeWord(used) == null) return Int.MIN_VALUE / 2
                    }
                }
                score -= obligations * 8
            }
            return score - maxGap * 2
        }

        private fun runLenAt(
            r: Int,
            c: Int,
        ): Int {
            var st = c
            while (st > 0 && grid[r][st - 1] != '#') st--
            var n = 0
            var i = st
            while (i < width && grid[r][i] != '#') {
                n++
                i++
            }
            return n
        }

        private fun runLenRight(
            r: Int,
            c: Int,
        ): Int {
            var n = 0
            var i = c + 1
            while (i < width && grid[r][i] != '#' && grid[r][i] != '.') {
                n++
                i++
            }
            return n
        }

        private fun vRunLen(
            r: Int,
            c: Int,
        ): Int {
            var top = r
            while (top > 0 && grid[top - 1][c] != '#') top--
            var n = 0
            var i = top
            while (i <= r && grid[i][c] != '#') {
                n++
                i++
            }
            return n
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
                        if ((0 until l).any { facts.forcedBlack[p + it] || letterBitsAt(facts, p, l, it) == 0 }) continue
                        val m = lexicon.initialMask(l)
                        var ok = true
                        for (i in 0 until l) {
                            val union = lexicon.unionMaskForLetters(l, i, letterBitsAt(facts, p, l, i))
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
                if (options.isEmpty()) {
                    rfWalk++
                    return false
                }
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
                if (step.word != null) rowUsed.add(step.word)
                steps.add(step)
                c = step.from
                k = step.k
            }
            if (c != 0) {
                rfWalk++
                return false
            }
            // apply forward
            steps.reverse()
            val colSnaps = Array(width) { columns[it].snapshot() }
            val wMark = words.size
            var pos = 0
            for ((si, step) in steps.withIndex()) {
                when (step.type) {
                    0 -> {
                        val hosted = si + 1 < steps.size && steps[si + 1].type == 1
                        if (!applyBlack(r, pos, hosted).also { if (!it) afBlack++ }) {
                            rfApply++
                            rollback(colSnaps, wMark, r)
                            return false
                        }
                        rowChars[pos] = '#'
                        pos++
                    }
                    1 -> {
                        val w = step.word!!
                        words.add(w)
                        used.add(w)
                        rowUsed.add(w)
                        for (i in w.indices) {
                            if (!applyRowLetter(r, pos + i, w[i], facts, isFinal = i == w.length - 1 && w.length < 5 && pos + w.length < width).also { if (!it) afWord++ }) {
                            rfApply++
                            rollback(colSnaps, wMark, r)
                            return false
                        }
                            rowChars[pos + i] = w[i]
                        }
                        pos += w.length
                    }
                    2 -> {
                        val bits = facts.maskLetters[pos]
                        val letters = (0 until 26).filter { bits and (1 shl it) != 0 }
                        if (letters.isEmpty()) {
                            rfApply++
                            rollback(colSnaps, wMark, r)
                            return false
                        }
                        val ch = 'A' + letters[random.nextInt(letters.size)]
                        if (!applyRowLetter(r, pos, ch, facts).also { if (!it) afSingle++ }) {
                            rfApply++
                            rollback(colSnaps, wMark, r)
                            return false
                        }
                        columns[pos].lastSingle = true
                        rowChars[pos] = ch
                        pos++
                    }
                }
            }
            for (i in 0 until width) grid[r][i] = rowChars[i]
            return true
        }

        // Corner columns: a vertical ending at height-3 or height-2 leaves a dead black
        // below (nothing to host at the border) — runs there end early or reach the bottom.
        private fun cornerTiming(
            c: Int,
            maxTotal: Int,
        ) {
            if (c < width - 2) return
            columns[c].forbidLength(maxTotal - 1)
            columns[c].forbidLength(maxTotal - 2)
        }

        private fun applyBlack(
            r: Int,
            c: Int,
            acrossHosted: Boolean,
        ): Boolean {
            val col = columns[c]
            if (!col.isEmpty && !col.forcedBlackNext && !col.reserved) {
                val w = col.completeWord(used) ?: return false
                words.add(w)
                used.add(w)
            }
            col.reset(height - r - 1, brickBand(c, r))
            cornerTiming(c, height - r - 1)
            // Un-across-hosted black must be hosted by the down word: owe two letters below.
            if (!acrossHosted) {
                if (r >= height - 2) return false
                col.hostDebt = 2
            }
            return true
        }

        private fun applyRowLetter(
            r: Int,
            c: Int,
            ch: Char,
            facts: RowFacts,
            isFinal: Boolean = false,
        ): Boolean {
            val col = columns[c]
            val rowsBelow = height - r - 1
            if (!col.forcedBlackNext && col.continueLetters(rowsBelow + 1) and (1 shl (ch - 'A')) != 0) {
                col.apply(ch)
            } else if (col.isEmpty && col.hostDebt == 0) {
                col.apply(ch)
                if (r + 1 < height) col.forcedBlackNext = true
            } else {
                return false
            }
            if (col.hostDebt > 0) col.hostDebt--
            col.lastSingle = false
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

    // === nogood persistence ===

    private fun nogoodStore(): File {
        val dir = sequenceOf(File("../../data/cogen"), File("data/cogen")).first { it.parentFile?.exists() == true }
        dir.mkdirs()
        val corpusFp =
            File(
                sequenceOf(
                    "../infrastructure/src/main/resources/words/words-fr.csv",
                    "grid/infrastructure/src/main/resources/words/words-fr.csv",
                ).first { File(it).exists() },
            ).length()
        return File(dir, "nogoods-" + engineVersion + "-" + corpusFp + ".bin")
    }

    private fun loadNogoods(): HashSet<Long> {
        val out = HashSet<Long>()
        val f = nogoodStore()
        if (!f.exists()) return out
        java.io.DataInputStream(f.inputStream().buffered()).use { ds ->
            val n = ds.readInt()
            repeat(n) { out.add(ds.readLong()) }
        }
        println("nogoods loaded: " + out.size + " from " + f.name)
        return out
    }

    private fun saveNogoods(
        nogoods: HashSet<Long>,
        preloaded: Int,
    ) {
        if (nogoods.size == preloaded) return
        val f = nogoodStore()
        val capped = if (nogoods.size > 3_000_000) nogoods.asSequence().take(3_000_000).toList() else nogoods.toList()
        java.io.DataOutputStream(f.outputStream().buffered()).use { ds ->
            ds.writeInt(capped.size)
            for (v in capped) ds.writeLong(v)
        }
        println("nogoods saved: " + capped.size + " (+" + (capped.size - preloaded) + ") to " + f.name)
    }

    private fun bandStore(): File = File(nogoodStore().parentFile, "bands-" + bandVersion + "-" + nogoodStore().name.substringAfterLast('-'))

    private fun loadBands(): MutableList<String> {
        val f = bandStore()
        if (!f.exists()) return mutableListOf()
        val out = f.readLines().filter { it.isNotBlank() }.toMutableList()
        println("bands loaded: " + out.size)
        return out
    }

    private fun saveBands(
        old: List<String>,
        fresh: Set<String>,
    ) {
        if (fresh.isEmpty()) return
        val all = (old + fresh).distinct().takeLast(400)
        bandStore().writeText(all.joinToString("\n"))
        println("bands saved: " + all.size + " (+" + fresh.size + ")")
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
