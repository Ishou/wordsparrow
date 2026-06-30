package com.bliss.grid.application.puzzle

import com.bliss.grid.application.analytics.AnalyticsEventSink
import com.bliss.grid.domain.analytics.AnalyticsEvent
import com.bliss.grid.domain.model.Column
import com.bliss.grid.domain.model.Position
import com.bliss.grid.domain.model.Row
import com.bliss.grid.domain.model.WordAxis
import java.sql.Connection
import java.time.Clock
import java.time.Duration
import java.util.UUID

/** Spends one hint to reveal the whole word at the cursor cell along [axis]; must run inside [HintWriteCoordinator.withUserLock]. */
class RevealCellHintUseCase(
    private val puzzleRepository: PuzzleRepository,
    private val hintUsageRepository: HintUsageRepository,
    private val analyticsEventSink: AnalyticsEventSink = AnalyticsEventSink.Noop,
    private val clock: Clock = Clock.systemUTC(),
) {
    fun execute(
        conn: Connection,
        puzzleId: UUID,
        userId: UUID,
        row: Int,
        column: Int,
        axis: WordAxis,
    ): RevealCellHintOutcome {
        val puzzle = puzzleRepository.get(puzzleId) ?: return RevealCellHintOutcome.PuzzleNotFound

        val grid = puzzle.grid
        if (row < 0 || row >= grid.height || column < 0 || column >= grid.width) {
            return RevealCellHintOutcome.InvalidCoord(
                "($row, $column) out of grid bounds (${grid.width}x${grid.height})",
            )
        }
        val position = Position(Row(row), Column(column))
        val placement =
            grid.placementCovering(position, axis)
                ?: return RevealCellHintOutcome.InvalidCoord(
                    "no $axis word covers ($row, $column)",
                )

        val view =
            hintUsageRepository.trySpend(
                conn,
                puzzleId,
                userId,
                puzzle.hintsAllowed,
                HINT_REFILL_INTERVAL,
                clock.instant(),
            ) ?: return RevealCellHintOutcome.BudgetExhausted

        analyticsEventSink.record(
            AnalyticsEvent.HintUsed(
                gridSize = "${grid.width}x${grid.height}",
                hintsUsedSoFar = puzzle.hintsAllowed - view.tokensRemaining,
            ),
            userId,
        )
        val cells =
            placement.letterPositions().map { (pos, letter) ->
                RevealedCell(pos.row.value, pos.column.value, letter)
            }
        return RevealCellHintOutcome.Granted(
            cells = cells,
            hintsRemaining = view.tokensRemaining,
            secondsUntilNextHint = view.secondsUntilNextHint,
        )
    }

    companion object {
        /** One hint credit regenerates every 10 minutes; the route reuses this for read-path budget views. */
        val HINT_REFILL_INTERVAL: Duration = Duration.ofMinutes(10)
    }
}

/** One revealed letter cell of a hinted word. */
data class RevealedCell(
    val row: Int,
    val column: Int,
    val letter: Char,
)

sealed class RevealCellHintOutcome {
    /** Hint granted; [cells] is every letter of the revealed word, [hintsRemaining] is the budget left, [secondsUntilNextHint] the regen countdown (null when full). */
    data class Granted(
        val cells: List<RevealedCell>,
        val hintsRemaining: Int,
        val secondsUntilNextHint: Long?,
    ) : RevealCellHintOutcome()

    /** No puzzle in the store for this id. Maps to 404 puzzle-not-found. */
    data object PuzzleNotFound : RevealCellHintOutcome()

    /** Per-(puzzle, user) cap reached. Maps to 429 hint-budget-exhausted. */
    data object BudgetExhausted : RevealCellHintOutcome()

    /** `(row, column)` out of bounds, or no word covers it on the requested axis. Maps to 400 invalid-coord. */
    data class InvalidCoord(
        val reason: String,
    ) : RevealCellHintOutcome()

    /** Fresh cookie re-verify failed under the lock (session was revoked). Maps to 401 auth-required. */
    data object SessionRevoked : RevealCellHintOutcome()
}
