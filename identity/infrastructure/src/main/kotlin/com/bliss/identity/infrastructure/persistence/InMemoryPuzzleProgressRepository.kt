package com.bliss.identity.infrastructure.persistence

import com.bliss.identity.application.ports.ProgressRepository
import com.bliss.identity.application.ports.UpsertOutcome
import com.bliss.identity.domain.progress.PuzzleId
import com.bliss.identity.domain.progress.PuzzleProgress
import com.bliss.identity.domain.user.UserId
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference

class InMemoryPuzzleProgressRepository : ProgressRepository {
    private val rows = ConcurrentHashMap<Pair<UserId, PuzzleId>, PuzzleProgress>()

    override suspend fun findByUser(userId: UserId): List<PuzzleProgress> = rows.values.filter { it.userId == userId }

    override suspend fun find(
        userId: UserId,
        puzzleId: PuzzleId,
    ): PuzzleProgress? = rows[userId to puzzleId]

    override suspend fun countByUser(userId: UserId): Int = rows.keys.count { it.first == userId }

    override suspend fun upsert(
        progress: PuzzleProgress,
        expectedUpdatedAt: Instant?,
    ): UpsertOutcome {
        val outcome = AtomicReference<UpsertOutcome>(UpsertOutcome.Conflict)
        rows.compute(progress.userId to progress.puzzleId) { _, existing ->
            if (existing?.updatedAt != expectedUpdatedAt) {
                outcome.set(UpsertOutcome.Conflict)
                existing
            } else {
                outcome.set(UpsertOutcome.Written(progress.updatedAt))
                progress
            }
        }
        return outcome.get()
    }
}
