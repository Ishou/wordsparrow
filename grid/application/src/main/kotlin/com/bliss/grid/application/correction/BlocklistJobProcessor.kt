package com.bliss.grid.application.correction

/** Scrubs one blocklist_word correction from stored grids; the dispatch seam ProcessCorrectionsUseCase routes to (ADR-0110 §2). */
fun interface BlocklistJobProcessor {
    fun scrub(job: CorrectionBackfillJob)
}
