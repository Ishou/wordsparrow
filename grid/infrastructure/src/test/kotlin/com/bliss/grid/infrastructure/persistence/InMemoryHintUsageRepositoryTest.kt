package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.bliss.grid.application.puzzle.HintBudgetCalculator
import org.junit.jupiter.api.Test
import java.lang.reflect.Proxy
import java.sql.Connection
import java.time.Duration
import java.time.Instant
import java.util.UUID

class InMemoryHintUsageRepositoryTest {
    private val now = Instant.parse("2026-06-30T12:00:00Z")
    private val ten = Duration.ofMinutes(10)

    @Test
    fun `budgetFor on a fresh puzzle and user reports a full bucket`() {
        val repo = InMemoryHintUsageRepository()
        val (puzzleId, userId) = ids()
        assertThat(repo.budgetFor(puzzleId, userId, 3, ten, now))
            .isEqualTo(HintBudgetCalculator.View(3, null))
    }

    @Test
    fun `three spends drain the bucket to zero then the fourth returns null`() {
        val repo = InMemoryHintUsageRepository()
        val (puzzleId, userId) = ids()
        assertThat(repo.trySpend(STUB_CONN, puzzleId, userId, 3, ten, now))
            .isEqualTo(HintBudgetCalculator.View(2, 600))
        assertThat(repo.trySpend(STUB_CONN, puzzleId, userId, 3, ten, now))
            .isEqualTo(HintBudgetCalculator.View(1, 600))
        assertThat(repo.trySpend(STUB_CONN, puzzleId, userId, 3, ten, now))
            .isEqualTo(HintBudgetCalculator.View(0, 600))
        assertThat(repo.trySpend(STUB_CONN, puzzleId, userId, 3, ten, now)).isNull()
    }

    @Test
    fun `one token regenerates after the interval elapses`() {
        val repo = InMemoryHintUsageRepository()
        val (puzzleId, userId) = ids()
        repeat(3) { repo.trySpend(STUB_CONN, puzzleId, userId, 3, ten, now) }
        val later = now.plusSeconds(600)
        assertThat(repo.budgetFor(puzzleId, userId, 3, ten, later))
            .isEqualTo(HintBudgetCalculator.View(1, 600))
        assertThat(repo.trySpend(STUB_CONN, puzzleId, userId, 3, ten, later))
            .isEqualTo(HintBudgetCalculator.View(0, 600))
    }

    @Test
    fun `trySpend keeps separate buckets per user`() {
        val repo = InMemoryHintUsageRepository()
        val puzzleId = UUID.randomUUID()
        val userA = UUID.randomUUID()
        val userB = UUID.randomUUID()
        assertThat(repo.trySpend(STUB_CONN, puzzleId, userA, 3, ten, now)?.tokensRemaining).isEqualTo(2)
        assertThat(repo.trySpend(STUB_CONN, puzzleId, userA, 3, ten, now)?.tokensRemaining).isEqualTo(1)
        assertThat(repo.trySpend(STUB_CONN, puzzleId, userB, 3, ten, now)?.tokensRemaining).isEqualTo(2)
    }

    @Test
    fun `deleteByUser removes every row for the user and is idempotent`() {
        val repo = InMemoryHintUsageRepository()
        val puzzleId = UUID.randomUUID()
        val userA = UUID.randomUUID()
        val userB = UUID.randomUUID()
        repo.trySpend(STUB_CONN, puzzleId, userA, 3, ten, now)
        repo.trySpend(STUB_CONN, puzzleId, userB, 3, ten, now)
        assertThat(repo.deleteByUser(userA)).isEqualTo(1)
        assertThat(repo.budgetFor(puzzleId, userA, 3, ten, now))
            .isEqualTo(HintBudgetCalculator.View(3, null))
        assertThat(repo.budgetFor(puzzleId, userB, 3, ten, now).tokensRemaining).isEqualTo(2)
        assertThat(repo.deleteByUser(userA)).isEqualTo(0)
    }

    private fun ids(): Pair<UUID, UUID> = UUID.randomUUID() to UUID.randomUUID()

    private companion object {
        private val STUB_CONN: Connection =
            Proxy.newProxyInstance(
                Connection::class.java.classLoader,
                arrayOf(Connection::class.java),
            ) { _, _, _ -> null } as Connection
    }
}
