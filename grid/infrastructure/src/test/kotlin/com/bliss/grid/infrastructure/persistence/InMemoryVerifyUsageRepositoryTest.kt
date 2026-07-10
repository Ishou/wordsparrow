package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import com.bliss.grid.application.puzzle.VerifyCooldownCalculator
import org.junit.jupiter.api.Test
import java.lang.reflect.Proxy
import java.sql.Connection
import java.time.Instant
import java.util.UUID

class InMemoryVerifyUsageRepositoryTest {
    private val now = Instant.parse("2026-06-30T12:00:00Z")

    @Test
    fun `cooldownFor on a fresh puzzle and user reports never-verified`() {
        val repo = InMemoryVerifyUsageRepository()
        val (puzzleId, userId) = ids()
        assertThat(repo.cooldownFor(puzzleId, userId, now))
            .isEqualTo(VerifyCooldownCalculator.Result(allowed = true, secondsUntilNextVerify = 0))
    }

    @Test
    fun `tryRecord starts a full cooldown then blocks a second call within the window`() {
        val repo = InMemoryVerifyUsageRepository()
        val (puzzleId, userId) = ids()
        val first = repo.tryRecord(STUB_CONN, puzzleId, userId, now)
        assertThat(first.allowed).isTrue()
        assertThat(first.secondsUntilNextVerify).isEqualTo(VerifyCooldownCalculator.COOLDOWN_SECONDS)

        val second = repo.tryRecord(STUB_CONN, puzzleId, userId, now.plusSeconds(600))
        assertThat(second.allowed).isFalse()
        assertThat(second.secondsUntilNextVerify).isEqualTo(1200)
    }

    @Test
    fun `tryRecord keeps separate cooldowns per user`() {
        val repo = InMemoryVerifyUsageRepository()
        val puzzleId = UUID.randomUUID()
        val userA = UUID.randomUUID()
        val userB = UUID.randomUUID()
        repo.tryRecord(STUB_CONN, puzzleId, userA, now)
        assertThat(repo.tryRecord(STUB_CONN, puzzleId, userB, now).allowed).isTrue()
    }

    @Test
    fun `deleteByUser removes the row and is idempotent`() {
        val repo = InMemoryVerifyUsageRepository()
        val (puzzleId, userId) = ids()
        repo.tryRecord(STUB_CONN, puzzleId, userId, now)
        assertThat(repo.deleteByUser(userId)).isEqualTo(1)
        assertThat(repo.cooldownFor(puzzleId, userId, now).allowed).isTrue()
        assertThat(repo.deleteByUser(userId)).isEqualTo(0)
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
