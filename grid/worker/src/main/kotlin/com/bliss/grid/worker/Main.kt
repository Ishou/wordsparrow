package com.bliss.grid.worker

import com.bliss.grid.application.correction.ExportCorrectionsUseCase
import com.bliss.grid.application.correction.ProcessBlocklistUseCase
import com.bliss.grid.application.correction.ProcessCorrectionsUseCase
import com.bliss.grid.application.correction.asDailyRegenerationPort
import com.bliss.grid.application.puzzle.DailyPuzzleSelector
import com.bliss.grid.application.puzzle.EnsureUpcomingDailiesUseCase
import com.bliss.grid.application.puzzle.GeneratePuzzleUseCase
import com.bliss.grid.application.puzzle.GridGenerationPort
import com.bliss.grid.application.puzzle.LoadOrGeneratePuzzleUseCase
import com.bliss.grid.application.puzzle.PuzzleRepository
import com.bliss.grid.application.puzzle.asDistilledGridGenerationPort
import com.bliss.grid.application.puzzle.asGridGenerationPort
import com.bliss.grid.application.puzzle.dailyPuzzleConstraints
import com.bliss.grid.domain.generation.ClueCooldownRepository
import com.bliss.grid.infrastructure.persistence.BlissDatabase
import com.bliss.grid.infrastructure.persistence.CsvClueOverrideAppender
import com.bliss.grid.infrastructure.persistence.CsvWordRepository
import com.bliss.grid.infrastructure.persistence.PostgresBlocklistBackfill
import com.bliss.grid.infrastructure.persistence.PostgresClueCooldownRepository
import com.bliss.grid.infrastructure.persistence.PostgresCorrectionRepository
import com.bliss.grid.infrastructure.persistence.PostgresGridBackfill
import com.bliss.grid.infrastructure.persistence.PostgresPuzzleRepository
import org.slf4j.LoggerFactory
import org.slf4j.MDC
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
            else -> {
                log.error("event=worker_unknown_arguments args=\"{}\"", args.joinToString(separator = " "))
                printUsage()
                1
            }
        }
    exitProcess(exit)
}

private const val DAILY_BEST_OF_N: Int = 8

private const val DEFAULT_OVERRIDES_CSV: String = "data/curated/clue_overrides_fr.csv"

private fun printUsage() {
    log.info(
        "usage: grid-worker --ensure-dailies | --regenerate-dailies [--start-offset N] [--window-days N] " +
            "| --process-corrections | --export-corrections | --help",
    )
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
        val cooldownRepository = PostgresClueCooldownRepository(dataSource)
        val blocklist =
            ProcessBlocklistUseCase(
                store = store,
                backfill = PostgresBlocklistBackfill(dataSource),
                regeneration = singleDateRegenerator(puzzleRepository, cooldownRepository).asDailyRegenerationPort(),
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
private fun singleDateRegenerator(
    puzzleRepository: PuzzleRepository,
    cooldownRepository: ClueCooldownRepository,
): EnsureUpcomingDailiesUseCase {
    val cooldownMax =
        System.getenv("GRID_CLUE_COOLDOWN_MAX")?.toIntOrNull()
            ?: LoadOrGeneratePuzzleUseCase.DEFAULT_COOLDOWN_MAX
    return EnsureUpcomingDailiesUseCase(
        puzzleRepository = puzzleRepository,
        gridGenerationPort = productionGridGenerationPort(),
        dailyPuzzleSelector = DailyPuzzleSelector(),
        cooldownRepository = cooldownRepository,
        cooldownMax = cooldownMax,
        windowDays = 1,
        bestOfN = DAILY_BEST_OF_N,
    )
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
        val cooldownRepository: ClueCooldownRepository = PostgresClueCooldownRepository(dataSource)
        executeAndExit(
            puzzleRepository,
            cooldownRepository,
            productionGridGenerationPort(),
            today = LocalDate.now(ZoneOffset.UTC).plusDays(startOffset.toLong()),
            force = force,
            windowDays = windowDays,
        )
    } finally {
        database.stop()
    }
}

private fun productionGridGenerationPort(): GridGenerationPort {
    val wordRepository = CsvWordRepository.frenchCorpus()
    // Per-call overrides from EnsureUpcomingDailiesUseCase replace the constructor maxAttempts at runtime.
    val generatePuzzle =
        GeneratePuzzleUseCase(
            wordRepository = wordRepository,
            defaults = dailyPuzzleConstraints(),
        )
    // Rollout toggle (deploy dark, release bright): serve distilled airier grids when GRID_DAILY_DISTILL=true (ADR-0117).
    return if (System.getenv("GRID_DAILY_DISTILL")?.toBooleanStrictOrNull() == true) {
        generatePuzzle.asDistilledGridGenerationPort()
    } else {
        generatePuzzle.asGridGenerationPort()
    }
}

internal fun executeAndExit(
    puzzleRepository: PuzzleRepository,
    cooldownRepository: ClueCooldownRepository,
    gridGenerationPort: GridGenerationPort,
    today: LocalDate = LocalDate.now(ZoneOffset.UTC),
    force: Boolean = false,
    windowDays: Int = EnsureUpcomingDailiesUseCase.DEFAULT_WINDOW_DAYS,
    edgePurgeHook: EdgePurgeHook = EdgePurgeHook(),
): Int {
    val cooldownMax =
        System.getenv("GRID_CLUE_COOLDOWN_MAX")?.toIntOrNull()
            ?: LoadOrGeneratePuzzleUseCase.DEFAULT_COOLDOWN_MAX
    val useCase =
        EnsureUpcomingDailiesUseCase(
            puzzleRepository = puzzleRepository,
            gridGenerationPort = gridGenerationPort,
            dailyPuzzleSelector = DailyPuzzleSelector(),
            cooldownRepository = cooldownRepository,
            cooldownMax = cooldownMax,
            windowDays = windowDays,
            // Offline pre-gen can afford best-of-N -> keep the sparsest daily grid (ADR-0095).
            bestOfN = DAILY_BEST_OF_N,
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
