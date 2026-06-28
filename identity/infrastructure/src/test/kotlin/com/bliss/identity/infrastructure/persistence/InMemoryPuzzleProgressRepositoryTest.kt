package com.bliss.identity.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNull
import com.bliss.identity.application.ports.UpsertOutcome
import com.bliss.identity.domain.progress.PuzzleId
import com.bliss.identity.domain.progress.PuzzleProgress
import com.bliss.identity.domain.user.UserId
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class InMemoryPuzzleProgressRepositoryTest {
    private val now: Instant = Instant.parse("2026-06-28T12:00:00Z")
    private val userId = UserId(UUID.randomUUID())
    private val puzzleId = PuzzleId(UUID.randomUUID())

    private fun row(
        payload: String = "{}",
        at: Instant = now,
    ) = PuzzleProgress(userId, puzzleId, payload, at)

    @Test
    fun `upsert with null base inserts a new row`() =
        runTest {
            val repo = InMemoryPuzzleProgressRepository()
            val outcome = repo.upsert(row(), expectedUpdatedAt = null)
            assertThat(outcome).isEqualTo(UpsertOutcome.Written(now))
            assertThat(repo.find(userId, puzzleId)?.payload).isEqualTo("{}")
        }

    @Test
    fun `upsert with null base conflicts when a row exists`() =
        runTest {
            val repo = InMemoryPuzzleProgressRepository()
            repo.upsert(row(), expectedUpdatedAt = null)
            val outcome = repo.upsert(row(payload = "{\"a\":1}", at = now.plusSeconds(10)), expectedUpdatedAt = null)
            assertThat(outcome).isInstanceOf(UpsertOutcome.Conflict::class)
            assertThat(repo.find(userId, puzzleId)?.payload).isEqualTo("{}")
        }

    @Test
    fun `upsert with matching base updates the row`() =
        runTest {
            val repo = InMemoryPuzzleProgressRepository()
            repo.upsert(row(), expectedUpdatedAt = null)
            val later = now.plusSeconds(30)
            val outcome = repo.upsert(row(payload = "{\"a\":1}", at = later), expectedUpdatedAt = now)
            assertThat(outcome).isEqualTo(UpsertOutcome.Written(later))
            assertThat(repo.find(userId, puzzleId)?.payload).isEqualTo("{\"a\":1}")
        }

    @Test
    fun `upsert with stale base conflicts and leaves the row untouched`() =
        runTest {
            val repo = InMemoryPuzzleProgressRepository()
            repo.upsert(row(), expectedUpdatedAt = null)
            val outcome = repo.upsert(row(payload = "{\"a\":1}", at = now.plusSeconds(30)), expectedUpdatedAt = now.minusSeconds(5))
            assertThat(outcome).isInstanceOf(UpsertOutcome.Conflict::class)
            assertThat(repo.find(userId, puzzleId)?.payload).isEqualTo("{}")
        }

    @Test
    fun `findByUser scopes to the user`() =
        runTest {
            val repo = InMemoryPuzzleProgressRepository()
            val other = UserId(UUID.randomUUID())
            repo.upsert(row(), expectedUpdatedAt = null)
            repo.upsert(PuzzleProgress(other, PuzzleId(UUID.randomUUID()), "{}", now), expectedUpdatedAt = null)
            assertThat(repo.findByUser(userId).map { it.userId }).isEqualTo(listOf(userId))
        }

    @Test
    fun `find returns null when absent`() =
        runTest {
            val repo = InMemoryPuzzleProgressRepository()
            assertThat(repo.find(userId, puzzleId)).isNull()
        }
}
