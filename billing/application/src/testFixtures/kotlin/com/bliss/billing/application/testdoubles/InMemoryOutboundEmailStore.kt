package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.OutboundEmailRecord
import com.bliss.billing.application.ports.OutboundEmailStore
import com.bliss.billing.domain.OutboundEmailStatus
import java.time.Duration
import java.time.Instant
import java.util.UUID

/** In-memory OutboundEmailStore for application-layer tests; mirrors the Postgres semantics (dedupe-key idempotency, lease-based claiming, state transitions) without infrastructure. */
class InMemoryOutboundEmailStore : OutboundEmailStore {
    val rows = mutableListOf<OutboundEmailRecord>()

    override suspend fun enqueue(record: OutboundEmailRecord): Boolean {
        if (rows.any { it.dedupeKey == record.dedupeKey }) return false
        rows += record
        return true
    }

    override suspend fun claimDue(
        now: Instant,
        limit: Int,
    ): List<OutboundEmailRecord> {
        val leaseUntil = now.plus(CLAIM_LEASE)
        val claimed =
            rows
                .filter { it.status == OutboundEmailStatus.PENDING && it.nextAttemptAt != null && !it.nextAttemptAt!!.isAfter(now) }
                .sortedBy { it.nextAttemptAt }
                .take(limit)
        return claimed.map { row ->
            val leased = row.copy(nextAttemptAt = leaseUntil)
            replace(row.id) { leased }
            leased
        }
    }

    override suspend fun claim(
        id: UUID,
        now: Instant,
    ): Boolean {
        val index =
            rows.indexOfFirst {
                it.id == id && it.status == OutboundEmailStatus.PENDING && it.nextAttemptAt != null && !it.nextAttemptAt!!.isAfter(now)
            }
        if (index < 0) return false
        rows[index] = rows[index].copy(nextAttemptAt = now.plus(CLAIM_LEASE))
        return true
    }

    override suspend fun pendingBacklog(): Int = rows.count { it.status == OutboundEmailStatus.PENDING }

    override suspend fun markSent(
        id: UUID,
        at: Instant,
    ) {
        replace(id) { it.copy(status = OutboundEmailStatus.SENT, sentAt = at, nextAttemptAt = null) }
    }

    override suspend fun recordFailure(
        id: UUID,
        attempts: Int,
        nextAttemptAt: Instant,
        error: String,
    ) {
        replace(id) {
            it.copy(status = OutboundEmailStatus.PENDING, attempts = attempts, nextAttemptAt = nextAttemptAt, lastError = error)
        }
    }

    override suspend fun markFailed(
        id: UUID,
        error: String,
    ) {
        replace(id) { it.copy(status = OutboundEmailStatus.FAILED, nextAttemptAt = null, lastError = error) }
    }

    fun byDedupeKey(dedupeKey: String): OutboundEmailRecord? = rows.firstOrNull { it.dedupeKey == dedupeKey }

    private fun replace(
        id: UUID,
        transform: (OutboundEmailRecord) -> OutboundEmailRecord,
    ) {
        val index = rows.indexOfFirst { it.id == id }
        if (index >= 0) rows[index] = transform(rows[index])
    }

    private companion object {
        // Mirrors PostgresOutboundEmailStore.CLAIM_LEASE so the in-memory double reproduces the claim semantics.
        val CLAIM_LEASE: Duration = Duration.ofMinutes(5)
    }
}
