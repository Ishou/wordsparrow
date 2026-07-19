package com.bliss.grid.application.puzzle

import com.bliss.grid.domain.generation.ClueCooldownPolicy
import com.bliss.grid.domain.generation.ClueId
import com.bliss.grid.domain.generation.LongWordCoverage
import com.bliss.grid.domain.model.ClueCell
import com.bliss.grid.domain.model.Grid
import org.slf4j.LoggerFactory
import java.time.Clock
import java.time.LocalDate
import java.util.UUID
import kotlin.random.Random

/** Pre-generates the rolling 7-day daily-puzzle window. See ADR-0042. */
class EnsureUpcomingDailiesUseCase(
    private val puzzleRepository: PuzzleRepository,
    private val gridGenerationPort: GridGenerationPort,
    private val dailyPuzzleSelector: DailyPuzzleSelector,
    private val recurrenceMinGapDays: Int = DEFAULT_RECURRENCE_MIN_GAP_DAYS,
    private val recurrenceMaxGapDays: Int = DEFAULT_RECURRENCE_MAX_GAP_DAYS,
    private val maxAttempts: Int = DEFAULT_MAX_ATTEMPTS,
    private val clock: Clock = Clock.systemUTC(),
    private val title: String = LoadOrGeneratePuzzleUseCase.DEFAULT_TITLE,
    private val language: String = LoadOrGeneratePuzzleUseCase.DEFAULT_LANGUAGE,
    private val hintsAllowed: Int = LoadOrGeneratePuzzleUseCase.DEFAULT_HINTS_ALLOWED,
    private val windowDays: Int = DEFAULT_WINDOW_DAYS,
    private val innerAttempts: Int = DEFAULT_INNER_ATTEMPTS,
    private val perAttemptTimeoutMs: Long = DEFAULT_PER_ATTEMPT_TIMEOUT_MS,
    private val bestOfN: Int = DEFAULT_BEST_OF_N,
    // Per-date grid size (ADR-0118); null keeps the port's base size (the dense, pre-sizing behaviour).
    private val gridSizeForDate: ((LocalDate) -> Pair<Int, Int>)? = null,
) {
    private val log = LoggerFactory.getLogger(EnsureUpcomingDailiesUseCase::class.java)

    // force appends a fresh row even when a current one exists, so a corrected corpus replaces a stale daily (ADR-0081).
    fun execute(
        today: LocalDate,
        force: Boolean = false,
    ): Summary {
        val persistedDates = mutableListOf<LocalDate>()
        val generatedDates = mutableListOf<LocalDate>()
        val failedDates = mutableListOf<LocalDate>()
        val skippedDates = mutableListOf<LocalDate>()

        // Sequential so a just-persisted day is a visible stored neighbor for the next; parallel runs would blind adjacent days to each other.
        // Stop on first failure so a later day never persists having skipped a gap that a retry would have filled.
        var stopped = false
        for (offset in 0 until windowDays) {
            val date = today.plusDays(offset.toLong())
            if (stopped) {
                skippedDates += date
                continue
            }
            if (!force && puzzleRepository.getCurrentForDate(date) != null) {
                log.info("daily_already_persisted date={}", date)
                persistedDates += date
                continue
            }
            val started = clock.millis()
            val (grid, attempts) = generateForDate(date)
            val elapsedMs = clock.millis() - started
            if (grid == null) {
                log.warn(
                    "daily_generation_exhausted date={} attempts={} elapsed_ms={}",
                    date,
                    attempts,
                    elapsedMs,
                )
                failedDates += date
                stopped = true
                continue
            }
            val puzzleId = persistGenerated(date, grid)
            log.info(
                "daily_generated date={} puzzle_id={} attempts={} elapsed_ms={}",
                date,
                puzzleId,
                attempts,
                elapsedMs,
            )
            generatedDates += date
        }
        return Summary(
            persistedDates = persistedDates.toList(),
            generatedDates = generatedDates.toList(),
            failedDates = failedDates.toList(),
            skippedDates = skippedDates.toList(),
        )
    }

    private fun generateForDate(date: LocalDate): Pair<Grid?, Int> {
        val cooldownPolicy = cooldownPolicyFor(date)
        val size = gridSizeForDate?.invoke(date)
        // Best-of-N (offline pre-gen only): keep highest coverage, ties -> fewest definition cells (ADR-0095 amendment).
        var best: Grid? = null
        var bestCoverage = -1L
        var bestBlack = Int.MAX_VALUE
        var totalAttempts = 0
        for (candidate in 0 until bestOfN.coerceAtLeast(1)) {
            for (attempt in 0 until maxAttempts) {
                totalAttempts++
                val grid =
                    gridGenerationPort.generate(
                        randomSeed = seedFor(date, candidate * maxAttempts + attempt),
                        cooldownPolicy = cooldownPolicy,
                        attempts = innerAttempts,
                        perAttemptTimeoutMs = perAttemptTimeoutMs,
                        width = size?.first,
                        height = size?.second,
                    )
                if (grid != null) {
                    val coverage = LongWordCoverage.coverageOf(grid, PUZZLE_MIN_WORD_LENGTH)
                    val definitionCells = grid.cells.values.count { it is ClueCell }
                    if (coverage > bestCoverage || (coverage == bestCoverage && definitionCells < bestBlack)) {
                        bestCoverage = coverage
                        bestBlack = definitionCells
                        best = grid
                    }
                    break
                }
            }
        }
        return best to totalAttempts
    }

    // Forbid clues used by stored neighbor grids within a random 5..10-day window (ADR-0031 amendment): date-derived, so order-independent and regeneration-safe.
    private fun cooldownPolicyFor(date: LocalDate): ClueCooldownPolicy {
        val forbidden =
            DailyClueRecurrence.forbiddenPairs(
                targetDate = date,
                neighborPairsByDate = neighborPairsByDate(date),
                minGapDays = recurrenceMinGapDays,
                maxGapDays = recurrenceMaxGapDays,
            )
        return ClueCooldownPolicy.fromSet(forbidden)
    }

    private fun neighborPairsByDate(date: LocalDate): Map<LocalDate, Set<ClueId>> {
        val out = HashMap<LocalDate, Set<ClueId>>()
        for (offset in -recurrenceMaxGapDays..recurrenceMaxGapDays) {
            if (offset == 0) continue
            val neighbor = date.plusDays(offset.toLong())
            val stored = puzzleRepository.getCurrentForDate(neighbor) ?: continue
            out[neighbor] =
                stored.puzzle.grid.placements
                    .mapTo(HashSet()) { ClueId(it.word.text, it.chosenClue.text) }
        }
        return out
    }

    private fun persistGenerated(
        date: LocalDate,
        grid: Grid,
    ): UUID {
        // Fresh v7 per generation so a regenerated date never collides with progress keyed on the prior id (ADR-0081).
        val puzzleId = dailyPuzzleSelector.freshDailyId(clock.millis())
        puzzleRepository.insertDaily(
            puzzleId = puzzleId,
            puzzleDate = date,
            stored =
                StoredPuzzle(
                    grid = grid,
                    title = title,
                    language = language,
                    hintsAllowed = hintsAllowed,
                    createdAt = clock.instant(),
                ),
        )
        return puzzleId
    }

    /** Outer stride = innerAttempts so each outer attempt owns a disjoint inner-seed block; 1e9 day stride dwarfs any reasonable outer*inner. */
    internal fun seedFor(
        date: LocalDate,
        attempt: Int,
    ): Long = date.toEpochDay() * SEED_DAY_MULTIPLIER + attempt.toLong() * innerAttempts.toLong()

    data class Summary(
        val persistedDates: List<LocalDate>,
        val generatedDates: List<LocalDate>,
        val failedDates: List<LocalDate>,
        val skippedDates: List<LocalDate>,
    )

    companion object {
        const val DEFAULT_WINDOW_DAYS: Int = 7
        const val DEFAULT_MAX_ATTEMPTS: Int = 20
        const val SEED_DAY_MULTIPLIER: Long = 1_000_000_000L

        /** Adjacent days within this many days never share a clue; the hard floor of the recurrence window (ADR-0031 amendment). */
        const val DEFAULT_RECURRENCE_MIN_GAP_DAYS: Int = 5

        /** Upper bound of the random per-clue recurrence gap; also the radius of stored neighbors consulted (ADR-0031 amendment). */
        const val DEFAULT_RECURRENCE_MAX_GAP_DAYS: Int = 10

        /** 1 preserves single-shot; the daily worker overrides to 8 (ADR-0095). */
        const val DEFAULT_BEST_OF_N: Int = 1

        /** Cron has time; 50 inner Luby restarts per outer seed is the production-grade budget. */
        const val DEFAULT_INNER_ATTEMPTS: Int = 50

        /** Cron-friendly per-attempt timeout (vs production route's 5s default). */
        const val DEFAULT_PER_ATTEMPT_TIMEOUT_MS: Long = 15_000L
    }
}

/** Stubbable seam over [GeneratePuzzleUseCase] so worker tests do not pay CSP solver cost. */
fun interface GridGenerationPort {
    // width/height override the use case's base size for this date (ADR-0118 daily sizing); null keeps the base.
    fun generate(
        randomSeed: Long,
        cooldownPolicy: ClueCooldownPolicy,
        attempts: Int,
        perAttemptTimeoutMs: Long,
        width: Int?,
        height: Int?,
    ): Grid?
}

fun GeneratePuzzleUseCase.asGridGenerationPort(): GridGenerationPort =
    GridGenerationPort { randomSeed, cooldownPolicy, attempts, perAttemptTimeoutMs, width, height ->
        executeWithOutcome(
            width = width,
            height = height,
            cooldownPolicy = cooldownPolicy,
            randomFactory = { attempt -> Random(randomSeed + attempt) },
            attemptsOverride = attempts,
            perAttemptTimeoutMsOverride = perAttemptTimeoutMs,
        ).grid
    }

// Distilled variant (ADR-0117): generateDistilled manages its own attempt/timeout budget, unlike the base port.
fun GeneratePuzzleUseCase.asDistilledGridGenerationPort(): GridGenerationPort =
    GridGenerationPort { randomSeed, cooldownPolicy, _, _, width, height ->
        executeDistilled(width = width, height = height, cooldownPolicy = cooldownPolicy, random = Random(randomSeed))
    }
