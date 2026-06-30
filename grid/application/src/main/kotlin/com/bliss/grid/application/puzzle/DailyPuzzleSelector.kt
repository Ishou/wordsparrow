package com.bliss.grid.application.puzzle

import java.time.LocalDate
import java.util.UUID
import kotlin.random.Random

/**
 * Mints daily-grid identity facets: a fresh-per-generation [freshDailyId]
 * (ADR-0081), plus the date-derived [gridNumberForDate] and
 * [difficultyForDate]. Identity is no longer a pure function of the date —
 * the date->row resolver lives in [PuzzleRepository.getCurrentForDate].
 */
class DailyPuzzleSelector(
    // Launch-day anchor — `2026-01-01` was the first ship date of the
    // daily-grid surface. Day 1 = launch day. Bump if the product
    // narrative shifts (re-numbering the past would invalidate links
    // shared on social media; expand-and-contract migration if needed).
    private val launchEpochDay: Long = LAUNCH_EPOCH_DAY,
) {
    /**
     * Mints a non-deterministic UUID v7 for a fresh daily generation (ADR-0081):
     * [nowEpochMs] becomes the 48-bit timestamp, the payload is random, so each
     * regeneration of a date gets a distinct id that cannot collide with stored
     * progress keyed on the prior id.
     */
    fun freshDailyId(nowEpochMs: Long): UUID =
        assembleUuidV7(
            tsMs = nowEpochMs,
            randA = Random.Default.nextInt(0x1000),
            randB = Random.Default.nextLong() and 0x3FFFFFFFFFFFFFFFL,
        )

    fun gridNumberForDate(date: LocalDate): Int = (date.toEpochDay() - launchEpochDay).toInt() + 1

    /**
     * Returns the wire-side difficulty token (`facile` / `moyen` /
     * `difficile`) for the given date. Hardcoded to `facile` in v1 — a
     * later PR will replace this with heuristics over the generated grid.
     * The route handler converts the string to `DifficultyDto` at the
     * api boundary.
     */
    fun difficultyForDate(
        @Suppress("UNUSED_PARAMETER") date: LocalDate,
    ): String = "facile"

    private fun assembleUuidV7(
        tsMs: Long,
        randA: Int,
        randB: Long,
    ): UUID {
        // UUID v7 layout (RFC 9562 §5.7):
        //   bits 0..47  = unix-ms timestamp
        //   bits 48..51 = version (0b0111 = 7)
        //   bits 52..63 = rand_a (12 bits)
        //   bits 64..65 = variant (0b10 — RFC 4122)
        //   bits 66..127 = rand_b (62 bits)
        val msb = (tsMs shl 16) or 0x7000L or randA.toLong()
        // ULong literal because 0x8000000000000000 overflows the signed
        // Long range; converting back to Long preserves the bit pattern
        // (the JVM stores it as the negative two's-complement value, which
        // is the correct variant=0b10 high bit pattern).
        val lsb = (0x8000000000000000UL or randB.toULong()).toLong()
        return UUID(msb, lsb)
    }

    companion object {
        // 2026-01-01 UTC. `LocalDate.of(2026, 1, 1).toEpochDay()` =
        // 20454. Inlining the literal so the value is grep-able and the
        // class has no static-initializer cost.
        const val LAUNCH_EPOCH_DAY: Long = 20454L
    }
}
