package com.bliss.grid.application.puzzle

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNull
import com.bliss.grid.domain.model.Column
import com.bliss.grid.domain.model.Direction
import com.bliss.grid.domain.model.Grid
import com.bliss.grid.domain.model.Position
import com.bliss.grid.domain.model.Row
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordPlacement
import org.junit.jupiter.api.Test
import java.lang.reflect.Proxy
import java.sql.Connection
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class VerifyGridUseCaseTest {
    @Test
    fun `allowed call returns true for correct cells and false for wrong cells, empty cells absent`() {
        val (puzzleId, userId) = ids()
        val clock = Clock.fixed(Instant.parse("2026-06-30T12:00:00Z"), ZoneOffset.UTC)
        val outcome =
            VerifyGridUseCase(fakePuzzleStore(puzzleId), fakeVerifyUsage(), clock = clock)
                .execute(
                    STUB_CONN,
                    puzzleId,
                    userId,
                    // "OR" is at (0,1)='O', (0,2)='R'; (0,2) is submitted wrong on purpose.
                    listOf(FilledCellInput(0, 1, "O"), FilledCellInput(0, 2, "X")),
                )

        assertThat(outcome).isInstanceOf(VerifyGridOutcome.Verified::class)
        val verified = outcome as VerifyGridOutcome.Verified
        assertThat(verified.cells).containsExactlyInAnyOrder(
            VerifiedCell(0, 1, true),
            VerifiedCell(0, 2, false),
        )
        assertThat(verified.secondsUntilNextVerify).isEqualTo(VerifyCooldownCalculator.COOLDOWN_SECONDS)
    }

    @Test
    fun `allowed call records last_verified_at`() {
        val (puzzleId, userId) = ids()
        val clock = Clock.fixed(Instant.parse("2026-06-30T12:00:00Z"), ZoneOffset.UTC)
        val usage = fakeVerifyUsage()
        VerifyGridUseCase(fakePuzzleStore(puzzleId), usage, clock = clock)
            .execute(STUB_CONN, puzzleId, userId, listOf(FilledCellInput(0, 1, "O")))
        assertThat(usage.lastVerifiedAtPeek(puzzleId, userId)).isEqualTo(clock.instant())
    }

    @Test
    fun `call within the cooldown returns CooldownActive with no verdicts and does not update last_verified_at`() {
        val (puzzleId, userId) = ids()
        val first = Instant.parse("2026-06-30T12:00:00Z")
        val usage = fakeVerifyUsage()
        val useCase = VerifyGridUseCase(fakePuzzleStore(puzzleId), usage, clock = Clock.fixed(first, ZoneOffset.UTC))
        useCase.execute(STUB_CONN, puzzleId, userId, listOf(FilledCellInput(0, 1, "O")))

        val secondClock = Clock.fixed(first.plusSeconds(600), ZoneOffset.UTC)
        val outcome =
            VerifyGridUseCase(fakePuzzleStore(puzzleId), usage, clock = secondClock)
                .execute(STUB_CONN, puzzleId, userId, listOf(FilledCellInput(0, 1, "O")))

        assertThat(outcome).isInstanceOf(VerifyGridOutcome.CooldownActive::class)
        assertThat((outcome as VerifyGridOutcome.CooldownActive).secondsUntilNextVerify).isEqualTo(1200)
        // Still the first call's timestamp; the blocked call must not have overwritten it.
        assertThat(usage.lastVerifiedAtPeek(puzzleId, userId)).isEqualTo(first)
    }

    @Test
    fun `SessionRevoked is a distinct outcome for a caller whose fresh cookie check fails under the write lock`() {
        // Mirrors RevealCellHintOutcome.SessionRevoked: auth is resolved by the route before the use case runs
        // (fresh cookie re-verify under HintWriteCoordinator.withUserLock), so this documents the contract shape.
        val outcome: VerifyGridOutcome = VerifyGridOutcome.SessionRevoked
        assertThat(outcome).isInstanceOf(VerifyGridOutcome.SessionRevoked::class)
    }

    @Test
    fun `PuzzleNotFound when store has no entry`() {
        val (puzzleId, userId) = ids()
        val outcome =
            VerifyGridUseCase(fakePuzzleStore(), fakeVerifyUsage())
                .execute(STUB_CONN, puzzleId, userId, listOf(FilledCellInput(0, 1, "O")))
        assertThat(outcome).isInstanceOf(VerifyGridOutcome.PuzzleNotFound::class)
    }

    @Test
    fun `InvalidCoord when row is out of bounds and the cooldown is not started`() {
        val (puzzleId, userId) = ids()
        val usage = fakeVerifyUsage()
        val outcome =
            VerifyGridUseCase(fakePuzzleStore(puzzleId), usage)
                .execute(STUB_CONN, puzzleId, userId, listOf(FilledCellInput(99, 0, "O")))
        assertThat(outcome).isInstanceOf(VerifyGridOutcome.InvalidCoord::class)
        assertThat(usage.lastVerifiedAtPeek(puzzleId, userId)).isNull()
    }

    @Test
    fun `InvalidCoord when coordinate points at a clue cell`() {
        val (puzzleId, userId) = ids()
        // (0, 0) is the clue cell for the sample puzzle's "OR" placement.
        val outcome =
            VerifyGridUseCase(fakePuzzleStore(puzzleId), fakeVerifyUsage())
                .execute(STUB_CONN, puzzleId, userId, listOf(FilledCellInput(0, 0, "O")))
        assertThat(outcome).isInstanceOf(VerifyGridOutcome.InvalidCoord::class)
    }

    private fun ids(): Pair<UUID, UUID> = UUID.randomUUID() to UUID.randomUUID()

    private fun fakePuzzleStore(seedId: UUID? = null): PuzzleRepository {
        val store = ConcurrentHashMap<UUID, StoredPuzzle>()
        if (seedId != null) store[seedId] = sampleStoredPuzzle()
        return object : PuzzleRepository {
            override fun get(puzzleId: UUID): StoredPuzzle? = store[puzzleId]

            override fun getOrCompute(
                puzzleId: UUID,
                factory: () -> StoredPuzzle?,
            ): StoredPuzzle? = store[puzzleId] ?: factory()?.also { store[puzzleId] = it }
        }
    }

    /** Test double exposing a non-recording peek so blocked-call tests can assert the timestamp did NOT advance. */
    private interface PeekableVerifyUsage : VerifyUsageRepository {
        fun lastVerifiedAtPeek(
            puzzleId: UUID,
            userId: UUID,
        ): Instant?
    }

    private fun fakeVerifyUsage(): PeekableVerifyUsage {
        val lastVerifiedAt = ConcurrentHashMap<Pair<UUID, UUID>, Instant>()
        return object : PeekableVerifyUsage {
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

            override fun lastVerifiedAtPeek(
                puzzleId: UUID,
                userId: UUID,
            ): Instant? = lastVerifiedAt[puzzleId to userId]
        }
    }

    private fun sampleStoredPuzzle(): StoredPuzzle =
        StoredPuzzle(
            grid =
                Grid.fromPlacements(
                    width = 3,
                    height = 3,
                    placements =
                        listOf(
                            WordPlacement(
                                Word(text = "OR", definition = "metal"),
                                Position(Row(0), Column(0)),
                                Direction.RIGHT,
                            ),
                        ),
                ),
            title = "T",
            language = "fr",
            hintsAllowed = 3,
            createdAt = Instant.parse("2026-04-24T15:30:00Z"),
        )

    private companion object {
        private val STUB_CONN: Connection =
            Proxy.newProxyInstance(
                Connection::class.java.classLoader,
                arrayOf(Connection::class.java),
            ) { _, _, _ -> null } as Connection
    }
}
