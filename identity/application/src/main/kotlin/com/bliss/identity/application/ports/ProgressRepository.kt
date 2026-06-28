package com.bliss.identity.application.ports

import com.bliss.identity.domain.progress.PuzzleId
import com.bliss.identity.domain.progress.PuzzleProgress
import com.bliss.identity.domain.user.UserId
import java.time.Instant

// Outcome of a conditional upsert: the adapter enforces optimistic concurrency atomically in SQL (ADR-0075).
sealed interface UpsertOutcome {
    data class Written(
        val updatedAt: Instant,
    ) : UpsertOutcome

    data object Conflict : UpsertOutcome
}

interface ProgressRepository {
    suspend fun findByUser(userId: UserId): List<PuzzleProgress>

    suspend fun find(
        userId: UserId,
        puzzleId: PuzzleId,
    ): PuzzleProgress?

    // Null expectedUpdatedAt allows first write; a mismatch with the stored updated_at yields Conflict.
    suspend fun upsert(
        progress: PuzzleProgress,
        expectedUpdatedAt: Instant?,
    ): UpsertOutcome
}
