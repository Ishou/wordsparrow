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

// Starvation guard for the ADR-0031 date-window recurrence: 22x15 daily generation must still fill
// when clues used within the last maxGap days are forbidden.
//
// The committed mock corpus carries ~1 clue per word (ADR-0097), so forbidding a clue there forbids
// the whole WORD and grossly overstates starvation — clue-diversity starvation only shows on a
// production-scale, multi-clue corpus. So the strict assertion runs only when WORDSPARROW_REAL_CORPUS_DIR
// points at a dir containing `words/words-fr.csv`; otherwise the test skips.
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
