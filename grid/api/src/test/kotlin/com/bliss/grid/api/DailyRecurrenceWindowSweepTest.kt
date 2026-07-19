package com.bliss.grid.api

import com.bliss.grid.application.puzzle.DailyClueRecurrence
import com.bliss.grid.application.puzzle.EnsureUpcomingDailiesUseCase
import com.bliss.grid.application.puzzle.GeneratePuzzleUseCase
import com.bliss.grid.application.puzzle.dailyPuzzleConstraints
import com.bliss.grid.domain.generation.ClueCooldownPolicy
import com.bliss.grid.domain.generation.ClueId
import com.bliss.grid.infrastructure.persistence.CsvWordRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.nio.file.Path
import java.time.LocalDate
import kotlin.random.Random

// Starvation guard (ADR-0031 amendment): 22x15 must fill at gap 5..10; asserts only vs WORDSPARROW_REAL_CORPUS_DIR because the mock corpus is ~1 clue/word (ADR-0097) and overstates starvation.
@Tag("bench")
class DailyRecurrenceWindowSweepTest {
    @Test
    fun `22x15 daily generation survives the 5 to 10 day recurrence window on a production-scale corpus`() {
        val corpusDir = System.getenv("WORDSPARROW_REAL_CORPUS_DIR")
        assumeTrue(corpusDir != null, "set WORDSPARROW_REAL_CORPUS_DIR (dir containing words/words-fr.csv) to run")
        val repo = CsvWordRepository.frenchFromDir(Path.of(corpusDir))

        val useCase = GeneratePuzzleUseCase(repo, dailyPuzzleConstraints())
        val minGap = EnsureUpcomingDailiesUseCase.DEFAULT_RECURRENCE_MIN_GAP_DAYS
        val maxGap = EnsureUpcomingDailiesUseCase.DEFAULT_RECURRENCE_MAX_GAP_DAYS
        val base = LocalDate.of(2026, 7, 1)
        val generations = 30

        val pairsByDate = HashMap<LocalDate, Set<ClueId>>()
        var failures = 0
        var totalAttempts = 0
        var len2Sum = 0
        var len3Sum = 0
        var successes = 0

        for (day in 0 until generations) {
            val date = base.plusDays(day.toLong())
            val neighbors = pairsByDate.filterKeys { it >= date.minusDays(maxGap.toLong()) }
            val forbidden = DailyClueRecurrence.forbiddenPairs(date, neighbors, minGap, maxGap)
            val outcome =
                useCase.executeWithOutcome(
                    cooldownPolicy = ClueCooldownPolicy.fromSet(forbidden),
                    randomFactory = { attempt -> Random(day * 1_000L + attempt) },
                    perAttemptTimeoutMsOverride = 5_000,
                )
            totalAttempts += outcome.attempts
            val grid = outcome.grid
            if (grid == null) {
                failures++
                continue
            }
            successes++
            len2Sum += grid.placements.count { it.word.text.length == 2 }
            len3Sum += grid.placements.count { it.word.text.length == 3 }
            pairsByDate[date] = grid.placements.mapTo(HashSet()) { ClueId(it.word.text, it.chosenClue.text) }
        }

        println()
        println("=== date-window recurrence sweep, 22x15, $generations sequential daily generations, gap $minGap..$maxGap ===")
        println(
            "failures=%d avg_attempts=%.2f avg_len2=%.1f avg_len3=%.1f".format(
                failures,
                totalAttempts.toDouble() / generations,
                if (successes == 0) 0.0 else len2Sum.toDouble() / successes,
                if (successes == 0) 0.0 else len3Sum.toDouble() / successes,
            ),
        )
        println()

        assertEquals(0, failures, "22x15 starved under the $minGap..$maxGap-day recurrence window: $failures/$generations failed")
    }
}
