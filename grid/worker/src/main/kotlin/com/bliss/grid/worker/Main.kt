package com.bliss.grid.worker

import com.bliss.grid.application.correction.ExportCorrectionsUseCase
import com.bliss.grid.application.correction.ProcessBlocklistUseCase
import com.bliss.grid.application.correction.ProcessCorrectionsUseCase
import com.bliss.grid.application.correction.SeedCorrectionsUseCase
import com.bliss.grid.application.correction.asDailyRegenerationPort
import com.bliss.grid.application.puzzle.DailyPuzzleSelector
import com.bliss.grid.application.puzzle.EnsureUpcomingDailiesUseCase
import com.bliss.grid.application.puzzle.GeneratePuzzleUseCase
import com.bliss.grid.application.puzzle.GridGenerationPort
import com.bliss.grid.application.puzzle.PuzzleRepository
import com.bliss.grid.application.puzzle.asDistilledGridGenerationPort
import com.bliss.grid.application.puzzle.asGridGenerationPort
import com.bliss.grid.application.puzzle.dailyGridSize
import com.bliss.grid.application.puzzle.dailyPuzzleConstraints
import com.bliss.grid.application.puzzle.distilledDailyBaseConstraints
import com.bliss.grid.infrastructure.persistence.BlissDatabase
import com.bliss.grid.infrastructure.persistence.CsvClueOverrideAppender
import com.bliss.grid.infrastructure.persistence.CsvCorrectionSeedSource
import com.bliss.grid.infrastructure.persistence.CsvGridClueSink
import com.bliss.grid.infrastructure.persistence.CsvWordRepository
import com.bliss.grid.infrastructure.persistence.PostgresBlocklistBackfill
import com.bliss.grid.infrastructure.persistence.PostgresCorrectionRepository
import com.bliss.grid.infrastructure.persistence.PostgresGridBackfill
import com.bliss.grid.infrastructure.persistence.PostgresGridClueEnumerationQuery
import com.bliss.grid.infrastructure.persistence.PostgresPuzzleRepository
import org.slf4j.LoggerFactory
import org.slf4j.MDC
import java.nio.file.Files
import java.nio.file.Path
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID
import kotlin.system.exitProcess

private val log = LoggerFactory.getLogger("com.bliss.grid.worker.Main")

fun main(args: Array<String>) {
    MDC.put("run_id", UUID.randomUUID().toString())
    val exit =
        when {
            args.contains("--help") || args.contains("-h") -> {
                printUsage()
                0
            }
            args.isEmpty() -> {
                log.error("event=worker_no_arguments")
                printUsage()
                1
            }
            args.contains("--regenerate-dailies") ->
                runDailies(
                    force = true,
                    startOffset = intArg(args, "--start-offset", 0),
                    windowDays = intArg(args, "--window-days", EnsureUpcomingDailiesUseCase.DEFAULT_WINDOW_DAYS),
                )
            args.contains("--ensure-dailies") -> runDailies(force = false)
            args.contains("--process-corrections") -> runProcessCorrections()
            args.contains("--export-corrections") -> runExportCorrections()
            args.any { it == SEED_FLAG || it.startsWith("$SEED_FLAG=") } -> runSeedCorrections(stringArg(args, SEED_FLAG))
            args.any { it == EXPORT_GRID_CLUES_FLAG || it.startsWith("$EXPORT_GRID_CLUES_FLAG=") } ->
                runExportGridClues(stringArg(args, EXPORT_GRID_CLUES_FLAG), stringArg(args, "--words"))
            else -> {
                log.error("event=worker_unknown_arguments args=\"{}\"", args.joinToString(separator = " "))
                printUsage()
                1
            }
        }
    exitProcess(exit)
}

private const val DAILY_BEST_OF_N: Int = 8

// Distilled generation self-retries internally (fresh templates + fill retries), so one outer attempt per date suffices.
private const val DISTILL_DAILY_MAX_ATTEMPTS: Int = 1

private const val DEFAULT_OVERRIDES_CSV: String = "data/curated/clue_overrides_fr.csv"

private const val SEED_FLAG: String = "--seed-corrections"

private const val EXPORT_GRID_CLUES_FLAG: String = "--export-grid-clues"

// Service identity stamped on created_by for ops-run bulk seeds (ADR-0108 amendment); marks seeded rows apart from maintainer API corrections.
private val SEED_JOB_ACTOR: UUID = UUID.fromString("5eed5eed-0000-0000-0000-000000000000")

private fun printUsage() {
    log.info(
        "usage: grid-worker --ensure-dailies | --regenerate-dailies [--start-offset N] [--window-days N] " +
            "| --process-corrections | --export-corrections | --seed-corrections <source.csv> " +
            "| --export-grid-clues <out.csv> [--words <words.txt>] | --help",
    )
}

// Read-only: enumerates the distinct (word, clue) pairs currently on stored grids into a CSV, the input to the seed-source builder (ADR-0108 amendment 2026-07-24).
private fun runExportGridClues(
    outPath: String?,
    wordsPath: String?,
): Int {
    if (outPath.isNullOrBlank()) {
        log.error("event=export_grid_clues_missing_out")
        printUsage()
        return 1
    }
    val words =
        wordsPath
            ?.let { Files.readAllLines(Path.of(it)) }
            ?.map(String::trim)
            ?.filter(String::isNotBlank)
            ?.toSet()
            ?: emptySet()
    val database = BlissDatabase(poolName = "grid-worker-hikari", maxPoolSize = 2, requireUrl = true)
    database.start()
    return try {
        val dataSource = database.dataSource() ?: error("DATABASE_URL produced a null DataSource")
        val rows = PostgresGridClueEnumerationQuery(dataSource).enumerate(words)
        CsvGridClueSink(Path.of(outPath)).write(rows)
        log.info("event=export_grid_clues_done word_filter={} rows={}", words.size, rows.size)
        0
    } finally {
        database.stop()
    }
}

// Bulk-seeds replace corrections from a pre-validated CSV; the existing --process-corrections sweep then patches the grids (ADR-0108 amendment 2026-07-24).
private fun runSeedCorrections(sourcePath: String?): Int {
    if (sourcePath.isNullOrBlank()) {
        log.error("event=seed_corrections_missing_source")
        printUsage()
        return 1
    }
    val database = BlissDatabase(poolName = "grid-worker-hikari", maxPoolSize = 2, requireUrl = true)
    database.start()
    return try {
        val dataSource = database.dataSource() ?: error("DATABASE_URL produced a null DataSource")
        val store = PostgresCorrectionRepository(dataSource)
        val rows = CsvCorrectionSeedSource(Path.of(sourcePath)).read()
        val summary = SeedCorrectionsUseCase(store).execute(rows, SEED_JOB_ACTOR)
        log.info(
            "event=seed_corrections_done submitted={} invalid={} inserted={} skipped_existing={}",
            summary.submitted,
            summary.invalid,
            summary.inserted,
            summary.skippedExisting,
        )
        // Pre-validated source should carry no invalid rows; a nonzero count is surfaced but valid rows still seed (re-run is idempotent).
        if (summary.invalid > 0) {
            log.error("event=seed_corrections_invalid_rows count={}", summary.invalid)
        }
        0
    } finally {
        database.stop()
    }
}

// Backfills every stored grid: patches corrected clues, scrubs blocklisted words (ADR-0108 §4, ADR-0110 §2). Terminal per-correction state lives in the DB, so a recorded failure exits 0.
private fun runProcessCorrections(): Int {
    val database = BlissDatabase(poolName = "grid-worker-hikari", maxPoolSize = 2, requireUrl = true)
    database.start()
    return try {
        val dataSource = database.dataSource() ?: error("DATABASE_URL produced a null DataSource")
        val store = PostgresCorrectionRepository(dataSource)
        val backfill = PostgresGridBackfill(dataSource)
        val puzzleRepository = PostgresPuzzleRepository(dataSource)
        val blocklist =
            ProcessBlocklistUseCase(
                store = store,
                backfill = PostgresBlocklistBackfill(dataSource),
                regeneration = singleDateRegenerator(puzzleRepository).asDailyRegenerationPort(),
            )
        val corrections = ProcessCorrectionsUseCase(store, backfill, blocklist)
        corrections.run()
        // Both paths mutate stored dailies: blocklist regenerates, replace/forbid patches the clue in place (ADR-0089 §5).
        purgeRegeneratedDailies((blocklist.regeneratedDates + corrections.patchedDailyDates).distinct())
        0
    } finally {
        database.stop()
    }
}

// ADR-0089 §5: every regen path purges the edge; best-effort and non-fatal — until-midnight TTL bounds the worst case.
internal fun purgeRegeneratedDailies(
    regeneratedDates: List<LocalDate>,
    edgePurgeHook: EdgePurgeHook = EdgePurgeHook(),
) {
    edgePurgeHook.afterGenerationRun(regeneratedDates)
}

// windowDays=1 so execute(date, force=true) regenerates exactly that date against the corrected corpus (ADR-0110 §2).
private fun singleDateRegenerator(puzzleRepository: PuzzleRepository): EnsureUpcomingDailiesUseCase {
    val (minGap, maxGap) = recurrenceGapsFromEnv()
    return EnsureUpcomingDailiesUseCase(
        puzzleRepository = puzzleRepository,
        // Plain port: distillation's cost is justified for the daily window, not the 5-min --process-corrections cadence (ADR-0117).
        gridGenerationPort = productionGridGenerationPort(distill = false),
        dailyPuzzleSelector = DailyPuzzleSelector(),
        recurrenceMinGapDays = minGap,
        recurrenceMaxGapDays = maxGap,
        windowDays = 1,
        bestOfN = DAILY_BEST_OF_N,
    )
}

// Date-window recurrence bounds (ADR-0031 amendment); env overrides let production tune without a redeploy of the constants.
private fun recurrenceGapsFromEnv(): Pair<Int, Int> {
    val min =
        System.getenv("GRID_DAILY_CLUE_MIN_GAP_DAYS")?.toIntOrNull()
            ?: EnsureUpcomingDailiesUseCase.DEFAULT_RECURRENCE_MIN_GAP_DAYS
    val max =
        System.getenv("GRID_DAILY_CLUE_MAX_GAP_DAYS")?.toIntOrNull()
            ?: EnsureUpcomingDailiesUseCase.DEFAULT_RECURRENCE_MAX_GAP_DAYS
    return min to max
}

// Flushes un-exported corrections into the offline override CSV so the durable corpus catches up (ADR-0108 §3).
private fun runExportCorrections(): Int {
    val database = BlissDatabase(poolName = "grid-worker-hikari", maxPoolSize = 2, requireUrl = true)
    database.start()
    return try {
        val dataSource = database.dataSource() ?: error("DATABASE_URL produced a null DataSource")
        val store = PostgresCorrectionRepository(dataSource)
        val csvPath = Path.of(System.getenv("CLUE_OVERRIDES_CSV") ?: DEFAULT_OVERRIDES_CSV)
        ExportCorrectionsUseCase(store, CsvClueOverrideAppender(csvPath)).run()
        0
    } finally {
        database.stop()
    }
}

// Parse `--name=value` or `--name value`; fall back to `default` when absent or unparseable.
internal fun intArg(
    args: Array<String>,
    name: String,
    default: Int,
): Int {
    args.firstOrNull { it.startsWith("$name=") }?.let { return it.substringAfter('=').toIntOrNull() ?: default }
    val idx = args.indexOf(name)
    return if (idx >= 0 && idx + 1 < args.size) args[idx + 1].toIntOrNull() ?: default else default
}

// Parse `--name=value` or `--name value`; null when absent or valueless.
internal fun stringArg(
    args: Array<String>,
    name: String,
): String? {
    args.firstOrNull { it.startsWith("$name=") }?.let { return it.substringAfter('=') }
    val idx = args.indexOf(name)
    return if (idx >= 0 && idx + 1 < args.size) args[idx + 1] else null
}

// force appends a fresh daily even when a row exists (ADR-0081); startOffset backdates the window, windowDays widens it.
private fun runDailies(
    force: Boolean,
    startOffset: Int = 0,
    windowDays: Int = EnsureUpcomingDailiesUseCase.DEFAULT_WINDOW_DAYS,
): Int {
    val database =
        BlissDatabase(
            poolName = "grid-worker-hikari",
            maxPoolSize = 2,
            requireUrl = true,
        )
    database.start()
    return try {
        val dataSource = database.dataSource() ?: error("DATABASE_URL produced a null DataSource")
        val puzzleRepository: PuzzleRepository = PostgresPuzzleRepository(dataSource)
        val distill = System.getenv("GRID_DAILY_DISTILL")?.toBooleanStrictOrNull() == true
        executeAndExit(
            puzzleRepository,
            productionGridGenerationPort(distill = distill),
            today = LocalDate.now(ZoneOffset.UTC).plusDays(startOffset.toLong()),
            force = force,
            windowDays = windowDays,
            distill = distill,
        )
    } finally {
        database.stop()
    }
}

// distill is scoped to the daily-window callers; --process-corrections passes false (ADR-0117).
private fun productionGridGenerationPort(distill: Boolean): GridGenerationPort {
    val wordRepository = CsvWordRepository.frenchCorpus()
    // Per-call overrides from EnsureUpcomingDailiesUseCase replace the constructor maxAttempts at runtime.
    // Distilled dailies are per-date sized off a bare base (ADR-0118); the dense path keeps the 22x15 ADR-0095 constraints.
    val generatePuzzle =
        GeneratePuzzleUseCase(
            wordRepository = wordRepository,
            defaults = if (distill) distilledDailyBaseConstraints() else dailyPuzzleConstraints(),
        )
    return if (distill) {
        generatePuzzle.asDistilledGridGenerationPort()
    } else {
        generatePuzzle.asGridGenerationPort()
    }
}

internal fun executeAndExit(
    puzzleRepository: PuzzleRepository,
    gridGenerationPort: GridGenerationPort,
    today: LocalDate = LocalDate.now(ZoneOffset.UTC),
    force: Boolean = false,
    windowDays: Int = EnsureUpcomingDailiesUseCase.DEFAULT_WINDOW_DAYS,
    distill: Boolean = false,
    edgePurgeHook: EdgePurgeHook = EdgePurgeHook(),
): Int {
    val (minGap, maxGap) = recurrenceGapsFromEnv()
    val useCase =
        EnsureUpcomingDailiesUseCase(
            puzzleRepository = puzzleRepository,
            gridGenerationPort = gridGenerationPort,
            dailyPuzzleSelector = DailyPuzzleSelector(),
            recurrenceMinGapDays = minGap,
            recurrenceMaxGapDays = maxGap,
            windowDays = windowDays,
            // Dense attempts are cheap (best-of-N pays off, ADR-0095); distillation is expensive + self-selecting/self-retrying, so it runs once per date -- retrying it would redo the backoff (ADR-0117).
            bestOfN = if (distill) 1 else DAILY_BEST_OF_N,
            maxAttempts = if (distill) DISTILL_DAILY_MAX_ATTEMPTS else EnsureUpcomingDailiesUseCase.DEFAULT_MAX_ATTEMPTS,
            // Per-date sizing is gated with distillation (ADR-0118): the dense path stays 22x15 so this deploys dark.
            gridSizeForDate = if (distill) ::dailyGridSize else null,
        )
    val summary = useCase.execute(today, force = force)
    log.info(
        "event=ensure_upcoming_dailies_summary persisted_count={} generated_count={} failed_count={} skipped_count={} failed_dates=[{}] skipped_dates=[{}]",
        summary.persistedDates.size,
        summary.generatedDates.size,
        summary.failedDates.size,
        summary.skippedDates.size,
        summary.failedDates.joinToString(separator = ","),
        summary.skippedDates.joinToString(separator = ","),
    )
    edgePurgeHook.afterGenerationRun(summary.generatedDates)
    return if (summary.failedDates.isEmpty() && summary.skippedDates.isEmpty()) 0 else 1
}
