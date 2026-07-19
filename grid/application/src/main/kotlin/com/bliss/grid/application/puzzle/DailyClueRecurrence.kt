package com.bliss.grid.application.puzzle

import com.bliss.grid.domain.generation.ClueId
import java.time.LocalDate

/** Forbids a daily clue within a random 5..10-day gap of its use on a stored neighbor grid; see ADR-0031 amendment (2026-07-19). */
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
