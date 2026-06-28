package com.bliss.identity.application.usecases

import com.bliss.identity.application.ports.Clock
import com.bliss.identity.application.ports.ProgressRepository
import com.bliss.identity.application.ports.UpsertOutcome
import com.bliss.identity.domain.progress.PuzzleId
import com.bliss.identity.domain.progress.PuzzleProgress
import com.bliss.identity.domain.user.UserId
import java.time.Instant

const val MAX_PAYLOAD_BYTES: Int = 64 * 1024
const val MAX_PUZZLES_PER_USER: Int = 500

data class PutProgressCommand(
    val userId: UserId,
    val puzzleId: PuzzleId,
    val payload: String,
    val baseUpdatedAt: Instant?,
)

sealed class PutProgressError(
    message: String,
) : RuntimeException(message) {
    class PayloadTooLarge(
        val sizeBytes: Int,
    ) : PutProgressError("Payload is $sizeBytes bytes; the cap is $MAX_PAYLOAD_BYTES (ADR-0075).")

    class StaleBase : PutProgressError("baseUpdatedAt does not match the stored row; re-pull and re-merge.")

    class QuotaExceeded(
        val count: Int,
    ) : PutProgressError("User already has $count stored puzzles; the cap is $MAX_PUZZLES_PER_USER (ADR-0075).")
}

class PutProgressUseCase(
    private val progress: ProgressRepository,
    private val clock: Clock,
) {
    suspend fun execute(command: PutProgressCommand): Instant {
        val size = command.payload.toByteArray(Charsets.UTF_8).size
        if (size > MAX_PAYLOAD_BYTES) throw PutProgressError.PayloadTooLarge(size)

        // Count check on potentially new inserts only; null-base on an existing row yields Conflict from the repo.
        if (command.baseUpdatedAt == null) {
            val count = progress.countByUser(command.userId)
            if (count >= MAX_PUZZLES_PER_USER) throw PutProgressError.QuotaExceeded(count)
        }

        val now = clock.now()
        val outcome =
            progress.upsert(
                PuzzleProgress(command.userId, command.puzzleId, command.payload, now),
                expectedUpdatedAt = command.baseUpdatedAt,
            )
        return when (outcome) {
            is UpsertOutcome.Written -> outcome.updatedAt
            is UpsertOutcome.Conflict -> throw PutProgressError.StaleBase()
        }
    }
}
