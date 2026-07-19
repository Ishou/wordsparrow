package com.bliss.grid.application.puzzle

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.doesNotContain
import assertk.assertions.hasSize
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isGreaterThan
import assertk.assertions.isLessThan
import assertk.assertions.isTrue
import com.bliss.grid.domain.generation.ClueCooldownPolicy
import com.bliss.grid.domain.generation.ClueId
import com.bliss.grid.domain.generation.LongWordCoverage
import com.bliss.grid.domain.model.ClueCell
import com.bliss.grid.domain.model.Column
import com.bliss.grid.domain.model.Direction
import com.bliss.grid.domain.model.Grid
import com.bliss.grid.domain.model.Position
import com.bliss.grid.domain.model.Row
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordPlacement
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class EnsureUpcomingDailiesUseCaseTest {
    private val today: LocalDate = LocalDate.of(2026, 5, 13)
    private val selector = DailyPuzzleSelector()

    @Test
    fun `all seven days already persisted skips generation entirely`() {
        val repo = TrackingPuzzleRepository()
        for (offset in 0 until 7) {
            val date = today.plusDays(offset.toLong())
            repo.seedDaily(date, newStoredPuzzle())
        }
        val port = RecordingPort(grids = { _ -> successfulGrid() })
        val useCase = newUseCase(repo, port)

        val summary = useCase.execute(today)

        assertThat(summary.persistedDates).hasSize(7)
        assertThat(summary.generatedDates).isEmpty()
        assertThat(summary.failedDates).isEmpty()
        assertThat(summary.skippedDates).isEmpty()
        assertThat(port.calls).isEmpty()
        assertThat(repo.insertedDates).isEmpty()
    }

    @Test
    fun `force regenerate appends a fresh row for an already-persisted date and current resolves to it`() {
        val repo = TrackingPuzzleRepository()
        val originalId = repo.seedDaily(today, newStoredPuzzle())
        val port = RecordingPort(grids = { _ -> successfulGrid() })
        val useCase = newUseCase(repo, port, windowDays = 1)

        val summary = useCase.execute(today, force = true)

        assertThat(summary.generatedDates).containsExactly(today)
        assertThat(summary.persistedDates).isEmpty()
        assertThat(repo.insertedDates).containsExactly(today)
        assertThat(port.calls).hasSize(1)
        val current = repo.getCurrentForDate(today)
        assertThat(current?.puzzleId == originalId).isEqualTo(false)
    }

    @Test
    fun `seven days needing generation succeed on first attempt and persist in date order`() {
        val repo = TrackingPuzzleRepository()
        val port = RecordingPort(grids = { _ -> successfulGrid() })
        val useCase = newUseCase(repo, port)

        val summary = useCase.execute(today)

        val expectedDates = (0L until 7L).map { today.plusDays(it) }
        assertThat(summary.generatedDates).containsExactly(*expectedDates.toTypedArray())
        assertThat(summary.failedDates).isEmpty()
        assertThat(summary.skippedDates).isEmpty()
        assertThat(summary.persistedDates).isEmpty()
        val seenSeeds = port.calls.map { it.seed }
        val expectedSeeds = expectedDates.map { it.toEpochDay() * 1_000_000_000L }
        assertThat(seenSeeds).containsExactly(*expectedSeeds.toTypedArray())
        assertThat(repo.insertedDates).containsExactly(*expectedDates.toTypedArray())
    }

    @Test
    fun `loop stops on first failed day and marks subsequent days as skipped`() {
        // Stop-on-failure preserves cooldown causality: a retry of day N must not observe day N+1's clues.
        val repo = TrackingPuzzleRepository()
        val day3 = today.plusDays(2)
        val day3Seed = day3.toEpochDay() * 1_000_000_000L
        val port =
            RecordingPort(
                grids = { call -> if (call.seed in day3Seed until day3Seed + 1000L) null else successfulGrid() },
            )
        val useCase = newUseCase(repo, port)

        val summary = useCase.execute(today)

        assertThat(summary.failedDates).containsExactly(day3)
        assertThat(summary.skippedDates).containsExactly(
            today.plusDays(3),
            today.plusDays(4),
            today.plusDays(5),
            today.plusDays(6),
        )
        assertThat(summary.generatedDates).containsExactly(today, today.plusDays(1))
        // 2 successes (today, today+1) + 20 exhausted attempts on day 3; day 4..7 never call the port.
        assertThat(port.calls).hasSize(22)
        assertThat(repo.insertedDates).hasSize(2)
    }

    @Test
    fun `inner attempts and per attempt timeout are propagated to the port`() {
        val repo = TrackingPuzzleRepository()
        val port = RecordingPort(grids = { _ -> successfulGrid() })
        val useCase =
            EnsureUpcomingDailiesUseCase(
                puzzleRepository = repo,
                gridGenerationPort = port,
                dailyPuzzleSelector = selector,
                windowDays = 3,
                innerAttempts = 42,
                perAttemptTimeoutMs = 7_777L,
            )

        useCase.execute(today)

        assertThat(port.calls).hasSize(3)
        port.calls.forEach { call ->
            assertThat(call.attempts).isEqualTo(42)
            assertThat(call.perAttemptTimeoutMs).isEqualTo(7_777L)
        }
    }

    @Test
    fun `seed iteration stops once an attempt converges`() {
        val repo = TrackingPuzzleRepository()
        val targetDate = today
        val targetEpochDay = targetDate.toEpochDay()
        val port =
            RecordingPort(
                grids = { call -> if (call.seed < targetEpochDay * 1_000_000_000L + 250L) null else successfulGrid() },
            )
        val useCase = newUseCase(repo, port, windowDays = 1)

        useCase.execute(targetDate)

        val seenSeeds = port.calls.map { it.seed }
        val innerStride = EnsureUpcomingDailiesUseCase.DEFAULT_INNER_ATTEMPTS.toLong()
        val expectedSeeds = (0..5).map { targetEpochDay * 1_000_000_000L + it * innerStride }
        assertThat(seenSeeds).containsExactly(*expectedSeeds.toTypedArray())
    }

    @Test
    fun `seedFor produces non-overlapping inner-seed blocks across consecutive outer attempts`() {
        val useCase = newUseCase(TrackingPuzzleRepository(), RecordingPort(grids = { _ -> null }))
        val innerAttempts = EnsureUpcomingDailiesUseCase.DEFAULT_INNER_ATTEMPTS

        val outer0Last = useCase.seedFor(today, 0) + (innerAttempts - 1)
        val outer1First = useCase.seedFor(today, 1)
        assertThat(outer0Last).isLessThan(outer1First)
    }

    @Test
    fun `seedFor avoids cross-date collision even at the last outer attempt`() {
        val useCase = newUseCase(TrackingPuzzleRepository(), RecordingPort(grids = { _ -> null }))
        val maxAttempts = EnsureUpcomingDailiesUseCase.DEFAULT_MAX_ATTEMPTS
        val innerAttempts = EnsureUpcomingDailiesUseCase.DEFAULT_INNER_ATTEMPTS

        val lastOuterLastInner = useCase.seedFor(today, maxAttempts - 1) + (innerAttempts - 1)
        val nextDayFirst = useCase.seedFor(today.plusDays(1), 0)
        assertThat(lastOuterLastInner).isLessThan(nextDayFirst)
    }

    @Test
    fun `best-of-N keeps the sparsest of N candidate grids`() {
        val repo = TrackingPuzzleRepository()
        val definitionCellCounts = listOf(5, 2, 4)
        val innerAttempts = 100
        val port =
            RecordingPort(
                grids = { call ->
                    val candidateIndex = (call.seed - today.toEpochDay() * 1_000_000_000L) / innerAttempts
                    gridWithClueCellCount(definitionCellCounts[candidateIndex.toInt()])
                },
            )
        val useCase =
            EnsureUpcomingDailiesUseCase(
                puzzleRepository = repo,
                gridGenerationPort = port,
                dailyPuzzleSelector = selector,
                windowDays = 1,
                maxAttempts = 1,
                innerAttempts = innerAttempts,
                bestOfN = 3,
            )

        useCase.execute(today)

        assertThat(port.calls).hasSize(3)
        val persistedClueCells =
            repo
                .getCurrentForDate(today)
                ?.puzzle
                ?.grid
                ?.cells
                ?.values
                ?.count { it is ClueCell }
        assertThat(persistedClueCells).isEqualTo(2)
    }

    @Test
    fun `best-of-N prefers higher long-word coverage over sparsity`() {
        val repo = TrackingPuzzleRepository()
        val innerAttempts = 100
        // Candidate 0: sparse (2 clue cells) but zero long-word coverage.
        // Candidate 1: more clue cells but a long word -> higher coverage; must win.
        val port =
            RecordingPort(
                grids = { call ->
                    val candidateIndex = (call.seed - today.toEpochDay() * 1_000_000_000L) / innerAttempts
                    if (candidateIndex.toInt() == 0) gridWithClueCellCount(2) else gridWithLongWord()
                },
            )
        val useCase =
            EnsureUpcomingDailiesUseCase(
                puzzleRepository = repo,
                gridGenerationPort = port,
                dailyPuzzleSelector = selector,
                windowDays = 1,
                maxAttempts = 1,
                innerAttempts = innerAttempts,
                bestOfN = 2,
            )

        useCase.execute(today)

        val persisted = repo.getCurrentForDate(today)?.puzzle?.grid
        assertThat(persisted?.let { LongWordCoverage.coverageOf(it, 2) } ?: 0L).isGreaterThan(0L)
    }

    @Test
    fun `candidate times maxAttempts plus attempt composition avoids seed collisions across candidates`() {
        val useCase = newUseCase(TrackingPuzzleRepository(), RecordingPort(grids = { _ -> null }))
        val maxAttempts = EnsureUpcomingDailiesUseCase.DEFAULT_MAX_ATTEMPTS
        val innerAttempts = EnsureUpcomingDailiesUseCase.DEFAULT_INNER_ATTEMPTS

        val candidate0LastAttempt = 0 * maxAttempts + (maxAttempts - 1)
        val candidate1FirstAttempt = 1 * maxAttempts + 0
        val seedCandidate0Last = useCase.seedFor(today, candidate0LastAttempt) + (innerAttempts - 1)
        val seedCandidate1First = useCase.seedFor(today, candidate1FirstAttempt)

        assertThat(seedCandidate0Last).isLessThan(seedCandidate1First)
    }

    @Test
    fun `first day failure stops loop and remaining days are skipped not failed`() {
        val repo = TrackingPuzzleRepository()
        val port = RecordingPort(grids = { _ -> null })
        val useCase = newUseCase(repo, port, windowDays = 2)

        val summary = useCase.execute(today)

        assertThat(summary.failedDates).containsExactly(today)
        assertThat(summary.skippedDates).containsExactly(today.plusDays(1))
        assertThat(repo.insertedDates).isEmpty()
    }

    @Test
    fun `regenerating one date in isolation avoids the clues of already-frozen neighbor grids`() {
        // The July-11 regression: a partial regeneration reused a frozen future day's clues because the
        // generation-seq cooldown could not see it. The date-window policy forbids stored neighbors directly.
        val repo = TrackingPuzzleRepository()
        val target = today
        val etePair = ClueId("ETE", "saison la plus chaude")
        val clePair = ClueId("CLE", "ouvre la serrure")
        repo.seedDaily(target.minusDays(1), storedFromPairs(etePair))
        repo.seedDaily(target.plusDays(1), storedFromPairs(clePair))

        // A picker that reuses each frozen clue unless the policy forbids it, mirroring the real fallback picker.
        val port =
            RecordingPort(grids = { call ->
                pickerGrid(call.cooldownPolicy, listOf(etePair, clePair))
            })
        val useCase = newUseCase(repo, port, windowDays = 1)

        useCase.execute(target, force = true)

        val policy = port.calls.last().cooldownPolicy
        assertThat(policy.isOnCooldown(etePair)).isTrue()
        assertThat(policy.isOnCooldown(clePair)).isTrue()
        val targetPairs = pairsOf(repo.getCurrentForDate(target)!!.puzzle.grid)
        assertThat(targetPairs).doesNotContain(etePair)
        assertThat(targetPairs).doesNotContain(clePair)
    }

    private fun pairsOf(grid: Grid): List<ClueId> = grid.placements.map { ClueId(it.word.text, it.chosenClue.text) }

    private fun storedFromPairs(vararg pairs: ClueId): StoredPuzzle =
        StoredPuzzle(
            grid = pickerGrid(ClueCooldownPolicy.Inert, pairs.toList()),
            title = "Grille du jour",
            language = "fr",
            hintsAllowed = 3,
            createdAt = Instant.parse("2026-05-13T00:00:00Z"),
        )

    // One placement per candidate: keep the pair if free, else swap to a non-colliding filler.
    private fun pickerGrid(
        policy: ClueCooldownPolicy,
        candidates: List<ClueId>,
    ): Grid {
        val placements =
            candidates.mapIndexed { i, pair ->
                val (text, clue) =
                    if (policy.isOnCooldown(pair)) "Z${pair.wordText}" to "def-${pair.wordText}" else pair.wordText to pair.clueText
                val word = Word(text = text, definition = clue)
                WordPlacement(
                    word = word,
                    cluePosition = Position(Row(i), Column(0)),
                    direction = Direction.RIGHT,
                    chosenClue = word.clues.first(),
                )
            }
        return Grid.fromPlacements(width = 12, height = candidates.size.coerceAtLeast(1), placements = placements)
    }

    private fun newUseCase(
        repo: PuzzleRepository,
        port: GridGenerationPort,
        windowDays: Int = 7,
    ): EnsureUpcomingDailiesUseCase =
        EnsureUpcomingDailiesUseCase(
            puzzleRepository = repo,
            gridGenerationPort = port,
            dailyPuzzleSelector = selector,
            windowDays = windowDays,
        )

    private fun successfulGrid(): Grid {
        val word = Word(text = "ABCDE", definition = "test")
        val placement =
            WordPlacement(
                word = word,
                cluePosition = Position(Row(0), Column(0)),
                direction = Direction.DOWN_RIGHT,
                chosenClue = word.clues.first(),
            )
        return Grid.fromPlacements(width = 5, height = 5, placements = listOf(placement))
    }

    /** 15x6 grid with a length-12 horizontal word (high coverage) plus short words (extra clue cells). */
    private fun gridWithLongWord(): Grid {
        val long =
            WordPlacement(
                word = Word(text = "ABCDEFGHIJKL", definition = "long"),
                cluePosition = Position(Row(0), Column(0)),
                direction = Direction.RIGHT,
            )
        val clutter =
            (2..4).map { r ->
                val word = Word(text = "W${'A' + r}", definition = "short")
                WordPlacement(word, Position(Row(r), Column(0)), Direction.RIGHT)
            }
        return Grid.fromPlacements(width = 15, height = 6, placements = listOf(long) + clutter)
    }

    private fun gridWithClueCellCount(count: Int): Grid {
        val placements =
            (0 until count).map { i ->
                val word = Word(text = "W${'A' + i}", definition = "test")
                WordPlacement(
                    word = word,
                    cluePosition = Position(Row(i), Column(0)),
                    direction = Direction.RIGHT,
                    chosenClue = word.clues.first(),
                )
            }
        return Grid.fromPlacements(width = 5, height = count.coerceAtLeast(1), placements = placements)
    }

    private fun newStoredPuzzle(): StoredPuzzle =
        StoredPuzzle(
            grid = successfulGrid(),
            title = "Grille du jour",
            language = "fr",
            hintsAllowed = 3,
            createdAt = Instant.parse("2026-05-13T00:00:00Z"),
        )

    private class TrackingPuzzleRepository : PuzzleRepository {
        private val store = ConcurrentHashMap<UUID, StoredPuzzle>()
        private val byDate = ConcurrentHashMap<LocalDate, MutableList<UUID>>()
        val insertedDates = mutableListOf<LocalDate>()

        fun seedDaily(
            date: LocalDate,
            value: StoredPuzzle,
        ): UUID {
            val id = UUID.randomUUID()
            putDated(id, date, value)
            return id
        }

        override fun get(puzzleId: UUID): StoredPuzzle? = store[puzzleId]

        override fun getOrCompute(
            puzzleId: UUID,
            factory: () -> StoredPuzzle?,
        ): StoredPuzzle? {
            val produced = factory() ?: return null
            return store.computeIfAbsent(puzzleId) { produced }
        }

        override fun getCurrentForDate(date: LocalDate): StoredDailyPuzzle? {
            val id = byDate[date]?.lastOrNull() ?: return null
            return store[id]?.let { StoredDailyPuzzle(id, it) }
        }

        override fun insertDaily(
            puzzleId: UUID,
            puzzleDate: LocalDate,
            stored: StoredPuzzle,
        ) {
            putDated(puzzleId, puzzleDate, stored)
            insertedDates += puzzleDate
        }

        private fun putDated(
            id: UUID,
            date: LocalDate,
            value: StoredPuzzle,
        ) {
            store[id] = value
            byDate.compute(date) { _, existing -> (existing ?: mutableListOf()).apply { add(id) } }
        }
    }

    private data class PortCall(
        val seed: Long,
        val cooldownPolicy: ClueCooldownPolicy,
        val attempts: Int,
        val perAttemptTimeoutMs: Long,
    )

    private class RecordingPort(
        val grids: (PortCall) -> Grid?,
    ) : GridGenerationPort {
        val calls = mutableListOf<PortCall>()

        override fun generate(
            randomSeed: Long,
            cooldownPolicy: ClueCooldownPolicy,
            attempts: Int,
            perAttemptTimeoutMs: Long,
        ): Grid? {
            val call = PortCall(randomSeed, cooldownPolicy, attempts, perAttemptTimeoutMs)
            calls += call
            return grids(call)
        }
    }
}
