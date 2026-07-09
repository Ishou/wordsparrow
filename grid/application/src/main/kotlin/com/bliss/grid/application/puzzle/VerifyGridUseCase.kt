package com.bliss.grid.application.puzzle

import com.bliss.grid.domain.model.LetterCell
import java.sql.Connection
import java.time.Clock
import java.util.UUID

/** Compares filled cells against the canonical solution, gated by a 30-min per-(puzzle, user) cooldown; must run inside [HintWriteCoordinator.withUserLock] (ADR-0099). */
class VerifyGridUseCase(
    private val puzzleRepository: PuzzleRepository,
    private val verifyUsageRepository: VerifyUsageRepository,
    private val clock: Clock = Clock.systemUTC(),
) {
    fun execute(
        conn: Connection,
        puzzleId: UUID,
        userId: UUID,
        cells: List<FilledCellInput>,
    ): VerifyGridOutcome {
        val puzzle = puzzleRepository.get(puzzleId) ?: return VerifyGridOutcome.PuzzleNotFound

        val byPosition =
            when (val resolved = resolveFilledCells(puzzle.grid, cells)) {
                is ResolvedCells.Invalid -> return VerifyGridOutcome.InvalidCoord(resolved.reason)
                is ResolvedCells.Ok -> resolved.byPosition
            }

        val cooldown = verifyUsageRepository.tryRecord(conn, puzzleId, userId, clock.instant())
        if (!cooldown.allowed) {
            return VerifyGridOutcome.CooldownActive(cooldown.secondsUntilNextVerify)
        }

        val verdicts =
            byPosition.map { (position, letter) ->
                val correct = (puzzle.grid.cells[position] as LetterCell).letter == letter
                VerifiedCell(position.row.value, position.column.value, correct)
            }
        return VerifyGridOutcome.Verified(verdicts, cooldown.secondsUntilNextVerify)
    }
}

/** One per-cell correctness verdict; never carries the canonical letter (ADR-0099 §1). */
data class VerifiedCell(
    val row: Int,
    val column: Int,
    val correct: Boolean,
)

sealed class VerifyGridOutcome {
    /** Verification completed; [secondsUntilNextVerify] is always the freshly-started cooldown ([VerifyCooldownCalculator.COOLDOWN_SECONDS]). */
    data class Verified(
        val cells: List<VerifiedCell>,
        val secondsUntilNextVerify: Long,
    ) : VerifyGridOutcome()

    /** Cooldown still active for this `(puzzle, user)`; no cells compared, no letters leaked. Maps to 429 verify-cooldown-active. */
    data class CooldownActive(
        val secondsUntilNextVerify: Long,
    ) : VerifyGridOutcome()

    /** No puzzle in the store for this id. Maps to 404 puzzle-not-found. */
    data object PuzzleNotFound : VerifyGridOutcome()

    /** Out of bounds, non-letter target, malformed letter, or duplicate cell. Maps to 400 invalid-coord; cooldown NOT started. */
    data class InvalidCoord(
        val reason: String,
    ) : VerifyGridOutcome()

    /** Fresh cookie re-verify failed under the lock (session was revoked). Maps to 401 auth-required. */
    data object SessionRevoked : VerifyGridOutcome()
}
