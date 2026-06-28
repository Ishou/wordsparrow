package com.bliss.identity.domain.progress

import com.bliss.identity.domain.user.UserId
import java.time.Instant

// payload is the frontend SoloStore JSON, opaque to identity (ADR-0075) — kept as a String so the domain never parses grid's cell shape.
data class PuzzleProgress(
    val userId: UserId,
    val puzzleId: PuzzleId,
    val payload: String,
    val updatedAt: Instant,
)
