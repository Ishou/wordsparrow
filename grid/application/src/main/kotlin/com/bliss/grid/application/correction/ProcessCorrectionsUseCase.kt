package com.bliss.grid.application.correction

import com.bliss.grid.domain.correction.ClueCorrection
import org.slf4j.LoggerFactory
import org.slf4j.MDC

private val log = LoggerFactory.getLogger("com.bliss.grid.application.correction.ProcessCorrectionsUseCase")

/** Drains pending/running correction backfills, dispatching by kind: patch replace/forbid, scrub blocklist_word (ADR-0108 §4, ADR-0110 §2). */
class ProcessCorrectionsUseCase(
    private val store: CorrectionWorkStore,
    private val backfill: GridBackfillPort,
    private val blocklist: BlocklistJobProcessor? = null,
    private val batchSize: Int = DEFAULT_BATCH_SIZE,
) {
    /** Processes every backfillable correction; returns the number of jobs acted on. */
    fun run(): Int {
        val jobs = store.backfillJobs()
        var processed = 0
        for (job in jobs) {
            MDC.put("correction_id", job.correctionId.toString())
            try {
                if (dispatch(job)) processed++
            } finally {
                MDC.remove("correction_id")
            }
        }
        log.info("event=process_corrections_summary jobs_processed={}", processed)
        return processed
    }

    // A blocklist_word cannot be patched out of a grid; it needs the regenerate/delete scrub, not the clue-patch path (ADR-0110 §2).
    private fun dispatch(job: CorrectionBackfillJob): Boolean {
        if (job.correction.kind == ClueCorrection.Kind.BLOCKLIST_WORD) {
            val processor = blocklist
            if (processor == null) {
                log.warn("event=blocklist_processor_absent correction_id={}", job.correctionId)
                return false
            }
            processor.scrub(job)
            return true
        }
        drain(job)
        return true
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
