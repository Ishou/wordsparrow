package com.bliss.billing.application.ports

import com.bliss.billing.domain.OutboundEmailKind
import com.bliss.billing.domain.OutboundEmailStatus
import java.time.Instant
import java.util.UUID

/** One rendered outbox row (ADR-0094). Content is fixed at enqueue time; the recipient address is resolved at send time, never stored. */
data class OutboundEmailRecord(
    val id: UUID,
    val userId: UUID,
    val kind: OutboundEmailKind,
    val dedupeKey: String,
    val subject: String,
    val htmlBody: String,
    val textBody: String,
    val status: OutboundEmailStatus,
    val attempts: Int,
    val nextAttemptAt: Instant?,
    val lastError: String?,
    val createdAt: Instant,
    val sentAt: Instant?,
)

/** Durable outbox for the legally-mandated durable-medium emails (ADR-0094): guarantees eventual delivery via enqueue + retry-drain instead of best-effort send-and-swallow. */
interface OutboundEmailStore {
    /** Idempotent insert keyed by [OutboundEmailRecord.dedupeKey] (ON CONFLICT DO NOTHING); returns true only when this call inserted the row, so a webhook redelivery never triggers a second immediate send. */
    suspend fun enqueue(record: OutboundEmailRecord): Boolean

    /** Up to [limit] pending rows whose next_attempt_at is at or before [now], oldest-due first — the drain's work batch. */
    suspend fun claimDue(
        now: Instant,
        limit: Int,
    ): List<OutboundEmailRecord>

    suspend fun markSent(
        id: UUID,
        at: Instant,
    )

    /** Leaves the row pending with an incremented attempt count and a backed-off next_attempt_at for a later retry. */
    suspend fun recordFailure(
        id: UUID,
        attempts: Int,
        nextAttemptAt: Instant,
        error: String,
    )

    /** Terminal state once retries are exhausted; the row is no longer claimed. */
    suspend fun markFailed(
        id: UUID,
        error: String,
    )
}
