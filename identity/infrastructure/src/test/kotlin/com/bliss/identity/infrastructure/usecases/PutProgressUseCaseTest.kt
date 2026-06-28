package com.bliss.identity.infrastructure.usecases

import assertk.assertFailure
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNotNull
import com.bliss.identity.application.usecases.MAX_PAYLOAD_BYTES
import com.bliss.identity.application.usecases.MAX_PUZZLES_PER_USER
import com.bliss.identity.application.usecases.PutProgressCommand
import com.bliss.identity.application.usecases.PutProgressError
import com.bliss.identity.application.usecases.PutProgressUseCase
import com.bliss.identity.domain.progress.PuzzleId
import com.bliss.identity.domain.user.UserId
import com.bliss.identity.infrastructure.persistence.InMemoryPuzzleProgressRepository
import com.bliss.identity.infrastructure.testdoubles.FixedClock
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class PutProgressUseCaseTest {
    private val now: Instant = Instant.parse("2026-06-28T12:00:00Z")
    private val userId = UserId(UUID.randomUUID())
    private val puzzleId = PuzzleId(UUID.randomUUID())

    private data class Sut(
        val useCase: PutProgressUseCase,
        val repo: InMemoryPuzzleProgressRepository,
        val clock: FixedClock,
    )

    private fun newCase(): Sut {
        val repo = InMemoryPuzzleProgressRepository()
        val clock = FixedClock(now)
        return Sut(PutProgressUseCase(repo, clock), repo, clock)
    }

    @Test
    fun `first write with null base is Written and server-stamps updatedAt`() =
        runTest {
            val sut = newCase()
            val at = sut.useCase.execute(PutProgressCommand(userId, puzzleId, "{}", baseUpdatedAt = null))
            assertThat(at).isEqualTo(now)
            assertThat(sut.repo.find(userId, puzzleId)?.updatedAt).isEqualTo(now)
        }

    @Test
    fun `second write with null base when a row exists is a Conflict`() =
        runTest {
            val sut = newCase()
            sut.useCase.execute(PutProgressCommand(userId, puzzleId, "{}", baseUpdatedAt = null))
            assertFailure { sut.useCase.execute(PutProgressCommand(userId, puzzleId, "{\"a\":1}", baseUpdatedAt = null)) }
                .isInstanceOf(PutProgressError.StaleBase::class)
        }

    @Test
    fun `matching base updates the row`() =
        runTest {
            val sut = newCase()
            sut.useCase.execute(PutProgressCommand(userId, puzzleId, "{}", baseUpdatedAt = null))
            sut.clock.set(now.plusSeconds(30))
            val at = sut.useCase.execute(PutProgressCommand(userId, puzzleId, "{\"a\":1}", baseUpdatedAt = now))
            assertThat(at).isEqualTo(now.plusSeconds(30))
            assertThat(sut.repo.find(userId, puzzleId)?.payload).isEqualTo("{\"a\":1}")
        }

    @Test
    fun `stale base is a Conflict`() =
        runTest {
            val sut = newCase()
            sut.useCase.execute(PutProgressCommand(userId, puzzleId, "{}", baseUpdatedAt = null))
            val stale = now.minusSeconds(5)
            assertFailure { sut.useCase.execute(PutProgressCommand(userId, puzzleId, "{\"a\":1}", baseUpdatedAt = stale)) }
                .isInstanceOf(PutProgressError.StaleBase::class)
        }

    @Test
    fun `payload over the cap is PayloadTooLarge and writes nothing`() =
        runTest {
            val sut = newCase()
            val oversized = "{\"x\":\"" + "a".repeat(MAX_PAYLOAD_BYTES) + "\"}"
            assertFailure { sut.useCase.execute(PutProgressCommand(userId, puzzleId, oversized, baseUpdatedAt = null)) }
                .isInstanceOf(PutProgressError.PayloadTooLarge::class)
            assertThat(sut.repo.find(userId, puzzleId)).isEqualTo(null)
        }

    @Test
    fun `payload at exactly the cap is Written`() =
        runTest {
            val sut = newCase()
            val filler = MAX_PAYLOAD_BYTES - "{\"x\":\"\"}".toByteArray().size
            val atCap = "{\"x\":\"" + "a".repeat(filler) + "\"}"
            assertThat(atCap.toByteArray().size).isEqualTo(MAX_PAYLOAD_BYTES)
            sut.useCase.execute(PutProgressCommand(userId, puzzleId, atCap, baseUpdatedAt = null))
            assertThat(sut.repo.find(userId, puzzleId)).isNotNull()
        }

    @Test
    fun `first write when puzzle count is at the cap is QuotaExceeded`() =
        runTest {
            val sut = newCase()
            repeat(MAX_PUZZLES_PER_USER) {
                sut.useCase.execute(PutProgressCommand(userId, PuzzleId(UUID.randomUUID()), "{}", baseUpdatedAt = null))
            }
            assertFailure {
                sut.useCase.execute(PutProgressCommand(userId, PuzzleId(UUID.randomUUID()), "{}", baseUpdatedAt = null))
            }.isInstanceOf(PutProgressError.QuotaExceeded::class)
        }

    @Test
    fun `update of existing puzzle at the cap is Written`() =
        runTest {
            val sut = newCase()
            sut.useCase.execute(PutProgressCommand(userId, puzzleId, "{}", baseUpdatedAt = null))
            repeat(MAX_PUZZLES_PER_USER - 1) {
                sut.useCase.execute(PutProgressCommand(userId, PuzzleId(UUID.randomUUID()), "{}", baseUpdatedAt = null))
            }
            sut.clock.set(now.plusSeconds(1))
            val at = sut.useCase.execute(PutProgressCommand(userId, puzzleId, "{\"a\":1}", baseUpdatedAt = now))
            assertThat(at).isEqualTo(now.plusSeconds(1))
        }
}
