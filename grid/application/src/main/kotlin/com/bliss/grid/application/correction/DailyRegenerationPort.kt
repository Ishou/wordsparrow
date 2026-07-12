package com.bliss.grid.application.correction

import com.bliss.grid.application.puzzle.EnsureUpcomingDailiesUseCase
import java.time.LocalDate

/** Regenerates a single daily date against the corrected corpus, appending a fresh-id row; true when one was generated (ADR-0081, ADR-0110). */
fun interface DailyRegenerationPort {
    fun regenerate(date: LocalDate): Boolean
}

/** Adapts the window=1 daily use case into the single-date regeneration seam the blocklist scrub needs. */
fun EnsureUpcomingDailiesUseCase.asDailyRegenerationPort(): DailyRegenerationPort =
    DailyRegenerationPort { date -> execute(date, force = true).generatedDates.contains(date) }
