package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.correction.BlocklistPreview
import com.bliss.grid.application.correction.BlocklistPreviewQuery

/** In-memory [BlocklistPreviewQuery] for local dev / route tests without a database (ADR-0110). */
class InMemoryBlocklistPreviewQuery(
    private val previews: Map<String, BlocklistPreview> = emptyMap(),
) : BlocklistPreviewQuery {
    override fun preview(word: String): BlocklistPreview = previews[word.uppercase()] ?: BlocklistPreview(0, 0)
}
