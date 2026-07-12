package com.bliss.grid.application.correction

import org.slf4j.LoggerFactory

private val log = LoggerFactory.getLogger("com.bliss.grid.application.correction.ExportCorrectionsUseCase")

/** Appends un-exported replace corrections to the offline override CSV so the durable corpus catches up (ADR-0108 §3). */
class ExportCorrectionsUseCase(
    private val store: CorrectionWorkStore,
    private val appender: ClueOverrideAppender,
) {
    /** Flushes exportable corrections to the override sink and stamps them; returns the number exported. */
    fun run(): Int {
        val pending = store.exportableCorrections()
        if (pending.isEmpty()) {
            log.info("event=export_corrections_summary exported_count=0")
            return 0
        }
        appender.append(
            pending.map {
                // assemble_corpus.load_overrides lower-cases the word key, so the override row must too.
                ClueOverrideRow(word = it.wordText.lowercase(), clue = it.newClueText, note = it.reason ?: DEFAULT_NOTE)
            },
        )
        pending.forEach { store.markExported(it.correctionId) }
        log.info("event=export_corrections_summary exported_count={}", pending.size)
        return pending.size
    }

    companion object {
        private const val DEFAULT_NOTE = "ADR-0108 maintainer correction"
    }
}
