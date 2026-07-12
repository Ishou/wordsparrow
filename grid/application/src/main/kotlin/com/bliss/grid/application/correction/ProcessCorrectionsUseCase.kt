package com.bliss.grid.application.correction

import org.slf4j.LoggerFactory
import org.slf4j.MDC

private val log = LoggerFactory.getLogger("com.bliss.grid.application.correction.ProcessCorrectionsUseCase")

/** Drains pending/running clue-correction backfills, patching stored grids idempotently and resumably (ADR-0108 §4). */
class ProcessCorrectionsUseCase(
    private val store: CorrectionWorkStore,
    private val backfill: GridBackfillPort,
    private val batchSize: Int = DEFAULT_BATCH_SIZE,
) {
    /** Processes every backfillable correction; returns the number of jobs drained. */
    fun run(): Int {
        val jobs = store.backfillJobs()
        var processed = 0
        for (job in jobs) {
            MDC.put("correction_id", job.correctionId.toString())
            try {
                drain(job)
                processed++
            } finally {
                MDC.remove("correction_id")
            }
        }
        log.info("event=process_corrections_summary jobs_processed={}", processed)
        return processed
    }

    private fun drain(job: CorrectionBackfillJob) {
        if (job.status == BackfillStatus.PENDING) {
            val matched = backfill.countMatching(job.correction)
            store.beginBackfill(job.correctionId, matched)
            log.info("event=backfill_started grids_matched={}", matched)
        }
        var lastError: String? = null
        while (true) {
            val result = backfill.patchBatch(job.correction, batchSize)
            store.heartbeatBackfill(job.correctionId, result.patched)
            if (result.lastError != null) lastError = result.lastError
            log.info("event=backfill_batch patched={} failed={}", result.patched, result.failed)
            // A patched grid drops out of the queue, so no progress means the remainder is stuck or done (ADR-0108 §4).
            if (result.patched == 0) break
        }
        val remaining = backfill.countMatching(job.correction)
        if (remaining == 0) {
            store.completeBackfill(job.correctionId)
            log.info("event=backfill_done")
        } else {
            val error = lastError ?: stalledMessage(remaining)
            store.failBackfill(job.correctionId, error)
            log.warn("event=backfill_failed remaining={} error=\"{}\"", remaining, error)
        }
    }

    private fun stalledMessage(remaining: Int): String = "backfill stalled with $remaining grids still matching"

    companion object {
        const val DEFAULT_BATCH_SIZE: Int = 200
    }
}
