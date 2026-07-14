package com.bliss.grid.domain.generation

import com.bliss.grid.domain.model.ClueCell
import com.bliss.grid.domain.model.Grid
import com.bliss.grid.domain.model.WordAxis
import kotlin.math.roundToInt

/** Per-axis "long word" thresholds — a horizontal word uses [horizontal], a vertical word [vertical]. */
data class LongThresholds(
    val horizontal: Int,
    val vertical: Int,
)

/**
 * Long-word coverage objective (ADR-0095 amendment): per-axis, grid-relative
 * "long" thresholds and a letter-sum score used to rank best-of-N candidates.
 */
object LongWordCoverage {
    /** Fraction of the axis dimension at/above which a word counts as "long". Swept; see the spec. */
    const val DEFAULT_LONG_FRACTION: Double = 0.4

    /** [lUseful] caps a threshold at the longest fillable length; it also never exceeds the axis dimension. */
    fun thresholds(
        width: Int,
        height: Int,
        minLen: Int,
        lUseful: Int = Int.MAX_VALUE,
        fraction: Double = DEFAULT_LONG_FRACTION,
    ): LongThresholds {
        val floor = minLen + 2
        return LongThresholds(
            horizontal = axisThreshold(width, fraction, floor, lUseful),
            vertical = axisThreshold(height, fraction, floor, lUseful),
        )
    }

    /** Total letters in words at or above their axis's long threshold. */
    fun score(
        grid: Grid,
        thresholds: LongThresholds,
    ): Long =
        grid.placements.sumOf { placement ->
            val length = placement.word.text.length
            val threshold = if (placement.direction.axis == WordAxis.HORIZONTAL) thresholds.horizontal else thresholds.vertical
            if (length >= threshold) length.toLong() else 0L
        }

    /** Convenience: coverage of [grid] under the grid-relative thresholds for its own dimensions. */
    fun coverageOf(
        grid: Grid,
        minLen: Int,
        lUseful: Int = Int.MAX_VALUE,
        fraction: Double = DEFAULT_LONG_FRACTION,
    ): Long = score(grid, thresholds(grid.width, grid.height, minLen, lUseful, fraction))

    /** Best-of-N selector: highest coverage, ties broken toward fewest definition cells (ADR-0095 density). */
    fun bestByCoverage(
        grids: List<Grid>,
        minLen: Int,
        fraction: Double = DEFAULT_LONG_FRACTION,
    ): Grid? =
        grids.maxWithOrNull(
            compareBy(
                { coverageOf(it, minLen, fraction = fraction) },
                { -it.cells.values.count { cell -> cell is ClueCell } },
            ),
        )

    private fun axisThreshold(
        dimension: Int,
        fraction: Double,
        floor: Int,
        lUseful: Int,
    ): Int {
        val ceil = minOf(lUseful, dimension).coerceAtLeast(floor)
        return (fraction * dimension).roundToInt().coerceIn(floor, ceil)
    }
}
