package com.bliss.survey.application.ports

import java.util.UUID

/** Resolves the answer word grid placed for a clue on a puzzle (ADR-0111); null when unresolved (grid down / clue not found). */
fun interface GridWordResolver {
    suspend fun resolve(
        puzzleId: UUID,
        clueText: String,
    ): String?
}
