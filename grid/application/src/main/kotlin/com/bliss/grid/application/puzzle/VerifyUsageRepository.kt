package com.bliss.grid.application.puzzle

import java.sql.Connection
import java.time.Instant
import java.util.UUID

/** Per-(puzzle, user) single-timestamp verify cooldown gate (ADR-0099); mirrors [HintUsageRepository]'s shape. */
interface VerifyUsageRepository {
    /** Atomic check-and-record on the caller's advisory-locked [conn]; records [now] only when the cooldown allows it. */
    fun tryRecord(
        conn: Connection,
        puzzleId: UUID,
        userId: UUID,
        now: Instant,
    ): VerifyCooldownCalculator.Result

    /** Read-only cooldown view for ([puzzleId], [userId]) on its own connection; an absent row reads as never-verified. */
    fun cooldownFor(
        puzzleId: UUID,
        userId: UUID,
        now: Instant,
    ): VerifyCooldownCalculator.Result

    /** GDPR Article 17; removes all verify rows for [userId] across puzzles. Returns rows deleted. Idempotent. */
    fun deleteByUser(userId: UUID): Int
}
