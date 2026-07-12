package com.bliss.grid.application.correction

import org.slf4j.LoggerFactory
import java.time.LocalDate

private val log = LoggerFactory.getLogger("com.bliss.grid.application.correction.ProcessBlocklistUseCase")

/** Scrubs a blocklisted word from stored grids: regenerates affected dailies, deletes affected solos; idempotent + resumable (ADR-0110 §2). */
class ProcessBlocklistUseCase(
    private val store: CorrectionWorkStore,
    private val backfill: BlocklistBackfillPort,
    private val regeneration: DailyRegenerationPort,
) : BlocklistJobProcessor {
    private val regenerated = linkedSetOf<LocalDate>()

    /** Dailies regenerated across every scrub on this instance; the edge cache must be purged for these (ADR-0089 §5). */
    val regeneratedDates: List<LocalDate> get() = regenerated.toList()

    override fun scrub(job: CorrectionBackfillJob) {
        val word =
            job.correction.wordText ?: run {
                store.failBackfill(job.correctionId, "blocklist_word correction has no word_text")
                log.warn("event=blocklist_missing_word")
                return
            }
        if (job.status == BackfillStatus.PENDING) {
            val matched = backfill.remainingWork(word).total
            store.beginBackfill(job.correctionId, matched)
            log.info("event=blocklist_started grids_matched={}", matched)
        }
        var lastError: String? = null
        while (true) {
            val work = backfill.remainingWork(word)
            if (work.isEmpty) break
            var scrubbed = 0
            for (date in work.dailyDates) {
                try {
                    if (regeneration.regenerate(date)) {
                        scrubbed++
                        regenerated.add(date)
                    } else {
                        lastError = "daily regeneration failed for $date"
                        log.warn("event=blocklist_daily_failed date={}", date)
                    }
                } catch (e: Exception) {
                    lastError = e.message ?: e.toString()
                    log.warn("event=blocklist_daily_failed date={} error=\"{}\"", date, lastError)
                }
            }
            for (soloId in work.soloIds) {
                try {
                    if (backfill.deleteSolo(soloId)) scrubbed++
                } catch (e: Exception) {
                    lastError = e.message ?: e.toString()
                    log.warn("event=blocklist_solo_failed puzzle_id={} error=\"{}\"", soloId, lastError)
                }
            }
            store.heartbeatBackfill(job.correctionId, scrubbed)
            log.info("event=blocklist_batch scrubbed={}", scrubbed)
            // No progress means the remainder keeps failing; stop rather than spin (ADR-0110 §2).
            if (scrubbed == 0) break
        }
        val remaining = backfill.remainingWork(word).total
        if (remaining == 0) {
            store.completeBackfill(job.correctionId)
            log.info("event=blocklist_done")
        } else {
            val error = lastError ?: "blocklist stalled with $remaining grids still containing the word"
            store.failBackfill(job.correctionId, error)
            log.warn("event=blocklist_failed remaining={} error=\"{}\"", remaining, error)
        }
    }
}
