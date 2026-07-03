package com.bliss.grid.api

import com.bliss.grid.application.puzzle.GeneratePuzzleUseCase
import com.bliss.grid.application.puzzle.PUZZLE_HEIGHT
import com.bliss.grid.application.puzzle.PUZZLE_WIDTH
import com.bliss.grid.domain.generation.ClueCooldownPolicy
import com.bliss.grid.domain.generation.ClueId
import com.bliss.grid.domain.generation.GridConstraints
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordClue
import com.bliss.grid.infrastructure.persistence.CsvWordRepository
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.io.InputStreamReader
import java.nio.charset.StandardCharsets
import java.text.Normalizer
import kotlin.random.Random

// Exploration bench: definition-cell density + fill cost at 28x20 under the real ADR-0031 daily rotation (sequential gens, per-(word,clue) cooldown, cm=8), across corpus arms incl. a full-corpus arm where blank-clue rows get placeholder clues.
@Tag("bench")
class DensityExplorationBenchTest {
    private data class ArmResult(
        val name: String,
        val fails: Int,
        val avgAttempts: Double,
        val defPctAvg: Double,
        val defPctMax: Double,
        val sharing: Double,
        val doubleDefPct: Double,
        val len2: Double,
        val avgWordLen: Double,
        val maxWordLen: Int,
        val msAvg: Long,
    )

    @Test
    fun `density exploration across corpus arms`() {
        val baseline = CsvWordRepository.frenchFromClasspath()
        val fullCorpus = loadCorpus(includeBlank = true)
        val plain = GridConstraints(width = PUZZLE_WIDTH, height = PUZZLE_HEIGHT)

        val stack = plain.copy(anchorCount = 3, lTargetHorizontal = 11, lTargetVertical = 8)
        val results =
            listOf(
                run("distill-MAX deep-search g120", baseline, plain.copy(distillBudget = Int.MAX_VALUE), generations = 2, gateTimeoutMs = 120_000, cooldown = false),
                run("STACK+distill8 deep g120", baseline, stack.copy(distillBudget = 8), generations = 2, gateTimeoutMs = 120_000, cooldown = false),
            )

        println()
        println("=== density exploration, 28x20, 20 sequential daily generations, cm=8 real rotation ===")
        println("| arm | fails/20 | avg att | def% avg | def% max | sharing | 2-def cells % | len-2 avg | avg wlen | max wlen | ms |")
        println("|-----|----------|---------|----------|----------|---------|---------------|-----------|----------|----------|----|")
        for (r in results) {
            println(
                "| %s | %d | %.2f | %.1f | %.1f | %.2f | %.0f%% | %.1f | %.2f | %d | %d |".format(
                    r.name, r.fails, r.avgAttempts, r.defPctAvg, r.defPctMax,
                    r.sharing, r.doubleDefPct, r.len2, r.avgWordLen, r.maxWordLen, r.msAvg,
                ),
            )
        }
        println()
    }

    private fun run(
        name: String,
        repo: CsvWordRepository,
        constraints: GridConstraints,
        generations: Int = 8,
        bestOf: Int = 1,
        gateTimeoutMs: Long = 5_000,
        cooldown: Boolean = true,
    ): ArmResult {
        val useCase = GeneratePuzzleUseCase(repo, constraints)
        // Feasibility gate: one cold generation within the gate budget, else skip the whole arm.
        val feasible =
            (0..1).any { g ->
                useCase.executeWithOutcome(
                    randomFactory = { Random(name.hashCode().toLong() + g * 7_919) },
                    attemptsOverride = 1,
                    perAttemptTimeoutMsOverride = gateTimeoutMs,
                ).grid != null
            }
        if (!feasible) {
            println("INFEASIBLE (no grid in ${gateTimeoutMs}ms): $name")
            return ArmResult(name = "$name [INFEASIBLE]", fails = generations, avgAttempts = 0.0, defPctAvg = 0.0, defPctMax = 0.0, sharing = 0.0, doubleDefPct = 0.0, len2 = 0.0, avgWordLen = 0.0, maxWordLen = 0, msAvg = 0)
        }
        val coolUntil = HashMap<ClueId, Long>()
        val roll = Random(name.hashCode())
        var fails = 0
        var attempts = 0
        var defPctSum = 0.0
        var defPctMax = 0.0
        var wordSum = 0
        var defCellSum = 0
        var doubleDefSum = 0
        var len2Sum = 0
        var lenSum = 0
        var maxWordLen = 0
        var msSum = 0L
        var ok = 0
        for (seq in 1L..generations) {
            val active = if (cooldown) coolUntil.filterValues { it > seq }.keys else emptySet()
            val t0 = System.currentTimeMillis()
            // Best-of-K selection (offline daily frame): K candidates against the same cooldown snapshot, keep the least-black one.
            var grid: com.bliss.grid.domain.model.Grid? = null
            for (k in 0 until bestOf) {
                val outcome =
                    useCase.executeWithOutcome(
                        cooldownPolicy = ClueCooldownPolicy.fromSet(active),
                        randomFactory = { a -> Random(name.hashCode() * 100_000L + seq * 1_000 + k * 100 + a) },
                        perAttemptTimeoutMsOverride = 3_000,
                    )
                attempts += outcome.attempts
                val cand = outcome.grid ?: continue
                if (grid == null ||
                    cand.placements.map { it.cluePosition }.toSet().size <
                    grid.placements.map { it.cluePosition }.toSet().size
                ) {
                    grid = cand
                }
            }
            if (grid == null) {
                fails++
                continue
            }
            msSum += System.currentTimeMillis() - t0
            ok++
            val byCell = grid.placements.groupBy { it.cluePosition }
            val defCells = byCell.size
            defCellSum += defCells
            doubleDefSum += byCell.values.count { it.size >= 2 }
            val pct = 100.0 * defCells / (PUZZLE_WIDTH * PUZZLE_HEIGHT)
            defPctSum += pct
            defPctMax = maxOf(defPctMax, pct)
            wordSum += grid.placements.size
            len2Sum += grid.placements.count { it.word.text.length == 2 }
            lenSum += grid.placements.sumOf { it.word.text.length }
            maxWordLen = maxOf(maxWordLen, grid.placements.maxOf { it.word.text.length })
            for (p in grid.placements) {
                coolUntil[ClueId(p.word.text, p.chosenClue.text)] = seq + 1 + roll.nextInt(8)
            }
        }
        val okSafe = maxOf(ok, 1)
        return ArmResult(
            name = name,
            fails = fails,
            avgAttempts = attempts.toDouble() / generations,
            defPctAvg = defPctSum / okSafe,
            defPctMax = defPctMax,
            sharing = wordSum.toDouble() / maxOf(defCellSum, 1),
            doubleDefPct = 100.0 * doubleDefSum / maxOf(defCellSum, 1),
            len2 = len2Sum.toDouble() / okSafe,
            avgWordLen = lenSum.toDouble() / maxOf(wordSum, 1),
            maxWordLen = maxWordLen,
            msAvg = msSum / okSafe,
        )
    }

    // Test-side CSV loader mirroring CsvWordRepository.fromClasspath, minus themed overlays; blank-clue rows become placeholder (clue == word) so the unclued corpus is placeable.
    private fun loadCorpus(includeBlank: Boolean): CsvWordRepository {
        val stream = CsvWordRepository::class.java.getResourceAsStream("/words/words-fr.csv")!!
        data class Row(val text: String, val clue: String?, val lemma: String, val freq: Long)
        val rows = ArrayList<Row>(130_000)
        InputStreamReader(stream, StandardCharsets.UTF_8).buffered().useLines { lines ->
            for ((i, line) in lines.withIndex()) {
                if (i == 0) continue
                val cols = splitCsv(line)
                if (cols.size < 9) continue
                val folded = foldAscii(cols[0])
                if (folded.isEmpty() || folded.any { it !in 'A'..'Z' }) continue
                val lemma = foldAscii(cols[8]).takeIf { it.isNotEmpty() && it.all { c -> c in 'A'..'Z' } } ?: folded
                val clue = cols[5].takeIf { it.isNotBlank() }
                rows += Row(folded, clue, lemma, cols[3].toLongOrNull() ?: 0L)
            }
        }
        val byText = LinkedHashMap<String, Pair<MutableList<WordClue>, Pair<String, Long>>>()
        for (r in rows.sortedByDescending { it.freq }) {
            val entry = byText.getOrPut(r.text) { mutableListOf<WordClue>() to (r.lemma to r.freq) }
            if (r.clue != null) entry.first += WordClue(r.clue, null)
        }
        val words =
            byText.mapNotNull { (text, e) ->
                val (clues, meta) = e
                when {
                    clues.isNotEmpty() -> Word(text, clues.distinctBy { it.text }, meta.first)
                    includeBlank -> Word(text, listOf(WordClue(text, null)), meta.first)
                    else -> null
                }
            }
        return CsvWordRepository(words)
    }

    private val diacritics = "\\p{InCombiningDiacriticalMarks}+".toRegex()

    private fun foldAscii(s: String): String =
        diacritics
            .replace(Normalizer.normalize(s, Normalizer.Form.NFD), "")
            .replace("œ", "oe").replace("Œ", "OE")
            .replace("æ", "ae").replace("Æ", "AE")
            .uppercase()

    // Minimal RFC4180 field splitter (quoted commas occur in clue text).
    private fun splitCsv(line: String): List<String> {
        val out = ArrayList<String>(10)
        val sb = StringBuilder()
        var inQuotes = false
        var i = 0
        while (i < line.length) {
            val ch = line[i]
            when {
                inQuotes && ch == '"' && i + 1 < line.length && line[i + 1] == '"' -> {
                    sb.append('"'); i++
                }
                ch == '"' -> inQuotes = !inQuotes
                ch == ',' && !inQuotes -> {
                    out += sb.toString(); sb.setLength(0)
                }
                else -> sb.append(ch)
            }
            i++
        }
        out += sb.toString()
        return out
    }
}
