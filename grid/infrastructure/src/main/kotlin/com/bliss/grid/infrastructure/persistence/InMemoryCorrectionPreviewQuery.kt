package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.correction.CorrectionPreview
import com.bliss.grid.application.correction.CorrectionPreviewQuery

/** In-memory [CorrectionPreviewQuery] for local dev / route tests without a database (ADR-0108). Keyed on clue text. */
class InMemoryCorrectionPreviewQuery(
    private val previews: Map<String, CorrectionPreview> = emptyMap(),
) : CorrectionPreviewQuery {
    override fun preview(
        oldClueText: String,
        wordText: String?,
    ): CorrectionPreview = previews[oldClueText] ?: CorrectionPreview(0, 0)
}
