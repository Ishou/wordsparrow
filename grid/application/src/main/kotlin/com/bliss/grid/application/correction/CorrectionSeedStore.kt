package com.bliss.grid.application.correction

import java.util.UUID

/** Bulk seed of replace corrections for an ops-run backfill; the existing --process-corrections sweep patches the grids (ADR-0108 amendment 2026-07-24). */
interface CorrectionSeedStore {
    /** Inserts each row as a pre-exported replace correction, skipping any (word, oldClue) already carried by a live replace row; returns the insert/skip tally. */
    fun seedReplacements(
        rows: List<SeedReplacement>,
        createdBy: UUID,
    ): SeedResult
}

/** A single `oldClueText -> newClueText` replacement scoped to [wordText] (the grid-cell surface). */
data class SeedReplacement(
    val wordText: String,
    val oldClueText: String,
    val newClueText: String,
)

/** Outcome of a [CorrectionSeedStore.seedReplacements] call. */
data class SeedResult(
    val inserted: Int,
    val skippedExisting: Int,
)
