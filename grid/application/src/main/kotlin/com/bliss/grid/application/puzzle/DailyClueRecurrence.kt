package com.bliss.grid.application.puzzle

import com.bliss.grid.domain.generation.ClueId
import java.time.LocalDate

/**
 * Calendar-window clue recurrence for the shared daily puzzle (ADR-0031 amendment, 2026-07-19).
 *
 * A `(word, clue)` pair used by a stored daily grid on source date S is forbidden on target date
 * D whenever `|D - S| <= h`, where `h` is a per-use horizon in `[minGapDays, maxGapDays]` derived
 * deterministically from the pair and S. The minimum guarantees adjacent days never repeat; the
 * `minGap..maxGap` band randomizes the recurrence distance. Deriving from stored grids by date
 * (not a generation counter) makes the constraint order-independent and regeneration-safe, which
 * the generation-seq TTL it replaces was not.
 */
object DailyClueRecurrence {
    fun forbiddenPairs(
        targetDate: LocalDate,
        neighborPairsByDate: Map<LocalDate, Set<ClueId>>,
        minGapDays: Int,
        maxGapDays: Int,
    ): Set<ClueId> {
        require(minGapDays in 1..maxGapDays) {
            "minGapDays must be in 1..maxGapDays, was $minGapDays..$maxGapDays"
        }
        val forbidden = HashSet<ClueId>()
        for ((sourceDate, pairs) in neighborPairsByDate) {
            if (sourceDate == targetDate) continue
            val distance = Math.abs(targetDate.toEpochDay() - sourceDate.toEpochDay())
            for (pair in pairs) {
                if (distance <= horizonDays(pair, sourceDate, minGapDays, maxGapDays).toLong()) {
                    forbidden += pair
                }
            }
        }
        return forbidden
    }

    // Stable across JVMs and regenerations: String.hashCode is specified, so a given (pair, day) always rolls the same horizon.
    internal fun horizonDays(
        pair: ClueId,
        sourceDate: LocalDate,
        minGapDays: Int,
        maxGapDays: Int,
    ): Int {
        val span = maxGapDays - minGapDays + 1
        val hash = "${pair.wordText}|${pair.clueText}|${sourceDate.toEpochDay()}".hashCode()
        return minGapDays + Math.floorMod(hash, span)
    }
}
