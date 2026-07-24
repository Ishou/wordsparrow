package com.bliss.grid.application.correction

import org.slf4j.LoggerFactory
import java.util.UUID

private val log = LoggerFactory.getLogger("com.bliss.grid.application.correction.SeedCorrectionsUseCase")

/** Seeds replace corrections in bulk from a pre-validated source; the DB store skips (word, oldClue) already carried by a live row (ADR-0108 amendment 2026-07-24). */
class SeedCorrectionsUseCase(
    private val store: CorrectionSeedStore,
) {
    data class Summary(
        val submitted: Int,
        val invalid: Int,
        val inserted: Int,
        val skippedExisting: Int,
    )

    fun execute(
        rows: List<SeedReplacement>,
        createdBy: UUID,
    ): Summary {
        val valid = rows.filter(::isValid)
        // The same (word, oldClue) can recur within one source; the store dedup only guards prior runs, so fold the batch first.
        val deduped = valid.distinctBy { it.wordText.uppercase() to it.oldClueText }
        val result = store.seedReplacements(deduped, createdBy)
        val summary =
            Summary(
                submitted = rows.size,
                invalid = rows.size - valid.size,
                inserted = result.inserted,
                skippedExisting = result.skippedExisting + (valid.size - deduped.size),
            )
        log.info(
            "event=seed_corrections_summary submitted={} invalid={} inserted={} skipped_existing={}",
            summary.submitted,
            summary.invalid,
            summary.inserted,
            summary.skippedExisting,
        )
        return summary
    }

    // A seed row is meaningful only when all three fields are present and the clue actually changes.
    private fun isValid(row: SeedReplacement): Boolean =
        row.wordText.isNotBlank() &&
            row.oldClueText.isNotBlank() &&
            row.newClueText.isNotBlank() &&
            row.oldClueText != row.newClueText
}
