package com.bliss.grid.application.correction

import java.time.LocalDate
import java.util.UUID

/** Match-on-word backfill for a blocklisted word: finds stored grids still placing it (ADR-0110 §2). */
interface BlocklistBackfillPort {
    /** Grids that still place [word]: distinct daily dates (latest row per date) plus solo puzzle ids. */
    fun remainingWork(word: String): BlocklistWork

    /** Deletes the solo grid [puzzleId] (never a daily); true when a row was removed. */
    fun deleteSolo(puzzleId: UUID): Boolean
}

/** Outstanding scrub work for a blocklist: [dailyDates] are regenerated, [soloIds] deleted (ADR-0110 §2). */
data class BlocklistWork(
    val dailyDates: List<LocalDate>,
    val soloIds: List<UUID>,
) {
    val total: Int = dailyDates.size + soloIds.size
    val isEmpty: Boolean = dailyDates.isEmpty() && soloIds.isEmpty()
}
