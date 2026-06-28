package com.bliss.identity.infrastructure.usecases

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.bliss.identity.application.usecases.GetProgressQuery
import com.bliss.identity.application.usecases.GetProgressUseCase
import com.bliss.identity.application.usecases.ListProgressQuery
import com.bliss.identity.application.usecases.ListProgressUseCase
import com.bliss.identity.application.usecases.PutProgressCommand
import com.bliss.identity.application.usecases.PutProgressUseCase
import com.bliss.identity.domain.progress.PuzzleId
import com.bliss.identity.domain.user.UserId
import com.bliss.identity.infrastructure.persistence.InMemoryPuzzleProgressRepository
import com.bliss.identity.infrastructure.testdoubles.FixedClock
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class GetAndListProgressUseCaseTest {
    private val now: Instant = Instant.parse("2026-06-28T12:00:00Z")
    private val alice = UserId(UUID.randomUUID())
    private val bob = UserId(UUID.randomUUID())

    private val repo = InMemoryPuzzleProgressRepository()
    private val put = PutProgressUseCase(repo, FixedClock(now))
    private val getProgress = GetProgressUseCase(repo)
    private val listProgress = ListProgressUseCase(repo)

    @Test
    fun `list returns only the caller's rows`() =
        runTest {
            val p1 = PuzzleId(UUID.randomUUID())
            val p2 = PuzzleId(UUID.randomUUID())
            val p3 = PuzzleId(UUID.randomUUID())
            put.execute(PutProgressCommand(alice, p1, "{}", null))
            put.execute(PutProgressCommand(alice, p2, "{}", null))
            put.execute(PutProgressCommand(bob, p3, "{}", null))

            val aliceRows = listProgress.execute(ListProgressQuery(alice))
            assertThat(aliceRows).hasSize(2)
            assertThat(aliceRows.map { it.puzzleId }).containsExactlyInAnyOrder(p1, p2)
        }

    @Test
    fun `get returns null when the caller has no row for the puzzle`() =
        runTest {
            assertThat(getProgress.execute(GetProgressQuery(alice, PuzzleId(UUID.randomUUID())))).isNull()
        }

    @Test
    fun `get returns the stored entry for the caller`() =
        runTest {
            val puzzleId = PuzzleId(UUID.randomUUID())
            put.execute(PutProgressCommand(alice, puzzleId, "{\"k\":1}", null))
            val found = getProgress.execute(GetProgressQuery(alice, puzzleId))
            assertThat(found?.payload).isEqualTo("{\"k\":1}")
        }

    @Test
    fun `get does not leak another user's row`() =
        runTest {
            val puzzleId = PuzzleId(UUID.randomUUID())
            put.execute(PutProgressCommand(bob, puzzleId, "{}", null))
            assertThat(getProgress.execute(GetProgressQuery(alice, puzzleId))).isNull()
        }
}
