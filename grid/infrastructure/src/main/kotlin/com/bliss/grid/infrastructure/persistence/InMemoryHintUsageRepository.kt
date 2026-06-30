package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.puzzle.HintBudgetCalculator
import com.bliss.grid.application.puzzle.HintUsageRepository
import java.sql.Connection
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** In-memory [HintUsageRepository]; [Connection] parameter ignored — per-key atomicity via ConcurrentHashMap.compute. */
class InMemoryHintUsageRepository : HintUsageRepository {
    private val states = ConcurrentHashMap<Pair<UUID, UUID>, HintBudgetCalculator.State>()

    override fun trySpend(
        conn: Connection,
        puzzleId: UUID,
        userId: UUID,
        capacity: Int,
        interval: Duration,
        now: Instant,
    ): HintBudgetCalculator.View? {
        var spent: HintBudgetCalculator.State? = null
        states.compute(puzzleId to userId) { _, existing ->
            val current = existing ?: HintBudgetCalculator.State(capacity, null)
            val next = HintBudgetCalculator.spend(current, now, capacity, interval)
            spent = next
            next ?: current
        }
        val next = spent ?: return null
        return HintBudgetCalculator.view(next, now, capacity, interval)
    }

    override fun budgetFor(
        puzzleId: UUID,
        userId: UUID,
        capacity: Int,
        interval: Duration,
        now: Instant,
    ): HintBudgetCalculator.View {
        val state = states[puzzleId to userId] ?: HintBudgetCalculator.State(capacity, null)
        return HintBudgetCalculator.view(state, now, capacity, interval)
    }

    override fun deleteByUser(userId: UUID): Int {
        val keys = states.keys.filter { it.second == userId }
        keys.forEach { states.remove(it) }
        return keys.size
    }
}
