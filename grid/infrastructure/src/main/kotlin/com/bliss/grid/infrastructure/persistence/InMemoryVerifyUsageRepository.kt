package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.puzzle.VerifyCooldownCalculator
import com.bliss.grid.application.puzzle.VerifyUsageRepository
import java.sql.Connection
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** In-memory [VerifyUsageRepository]; [Connection] parameter ignored — per-key atomicity via ConcurrentHashMap.compute. */
class InMemoryVerifyUsageRepository : VerifyUsageRepository {
    private val lastVerifiedAt = ConcurrentHashMap<Pair<UUID, UUID>, Instant>()

    override fun tryRecord(
        conn: Connection,
        puzzleId: UUID,
        userId: UUID,
        now: Instant,
    ): VerifyCooldownCalculator.Result {
        var result: VerifyCooldownCalculator.Result? = null
        lastVerifiedAt.compute(puzzleId to userId) { _, existing ->
            val cooldown = VerifyCooldownCalculator.view(existing, now)
            // A successful record always starts a fresh full-length cooldown, not the pre-write remainder.
            result =
                if (cooldown.allowed) {
                    VerifyCooldownCalculator.Result(true, VerifyCooldownCalculator.COOLDOWN_SECONDS)
                } else {
                    cooldown
                }
            if (cooldown.allowed) now else existing
        }
        return result!!
    }

    override fun cooldownFor(
        puzzleId: UUID,
        userId: UUID,
        now: Instant,
    ): VerifyCooldownCalculator.Result = VerifyCooldownCalculator.view(lastVerifiedAt[puzzleId to userId], now)

    override fun deleteByUser(userId: UUID): Int {
        val keys = lastVerifiedAt.keys.filter { it.second == userId }
        keys.forEach { lastVerifiedAt.remove(it) }
        return keys.size
    }
}
