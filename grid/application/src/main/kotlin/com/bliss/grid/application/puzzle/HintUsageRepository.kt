package com.bliss.grid.application.puzzle

import java.sql.Connection
import java.time.Duration
import java.time.Instant
import java.util.UUID

/** Per-(puzzle, user) regenerating token bucket; each user has an independent budget even on a shared puzzleId URL. */
interface HintUsageRepository {
    /** Atomic spend on the caller's advisory-locked [conn]; returns the post-spend budget view, or null when empty (maps to 429). */
    fun trySpend(
        conn: Connection,
        puzzleId: UUID,
        userId: UUID,
        capacity: Int,
        interval: Duration,
        now: Instant,
    ): HintBudgetCalculator.View?

    /** Read-only budget for ([puzzleId], [userId]) on its own connection; an absent row reads as a full bucket. */
    fun budgetFor(
        puzzleId: UUID,
        userId: UUID,
        capacity: Int,
        interval: Duration,
        now: Instant,
    ): HintBudgetCalculator.View

    /** GDPR Article 17; removes all hint rows for [userId] across puzzles. Returns rows deleted. Idempotent. */
    fun deleteByUser(userId: UUID): Int
}
